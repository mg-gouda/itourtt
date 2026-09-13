import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateComplaintChargeDto,
  UpdateComplaintChargeDto,
  VoidComplaintChargeDto,
} from './dto/create-complaint-charge.dto.js';
import type { Currency, ComplaintParty } from '../../generated/prisma/enums.js';

/** Only these parties have a fee table a deduction can land in. */
const CHARGEABLE_PARTIES: ComplaintParty[] = ['DRIVER', 'REP', 'SUPPLIER'];

/**
 * The money side of a complaint on the *supplier* of the service.
 *
 * Nothing moves automatically. A charge is raised, approved and posted as three
 * separate permission-gated steps; only posting writes anything to a fee table,
 * and it writes a plain negative-amount row against the same job. Those rows
 * already flow into period totals, the finance screens and every export, so no
 * downstream code needed changing to make the deduction visible.
 *
 * A deduction belongs to the **job**. The complaint is optional and usually
 * later: a dispatcher docks a driver from the grid the moment it goes wrong,
 * and the complaint written up afterwards adopts that charge
 * ({@link attachToComplaint}), so the money is entered once, where it was
 * noticed, and still shows on the complaint's party-charge panel.
 *
 * A job can be docked on several people at once — **one charge per party** —
 * each approved, posted and voided on its own. What is not allowed is two live
 * charges against the same party on the same job: void the first, or override
 * its amount while it is still PENDING.
 */
@Injectable()
export class ComplaintChargesService {
  private readonly logger = new Logger(ComplaintChargesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Raises a deduction on a job. `complaintId` is optional: given, the charge is
   * the complaint's own party charge and may only fall on a party it blames;
   * omitted, it is a standing deduction on the job that the next complaint
   * logged against it will adopt.
   */
  async create(dto: CreateComplaintChargeDto, userId: string) {
    const job = await this.prisma.trafficJob.findFirst({
      where: { id: dto.trafficJobId, deletedAt: null },
      select: {
        id: true,
        internalRef: true,
        assignment: { select: { driverId: true, repId: true, supplierId: true } },
      },
    });
    if (!job) {
      throw new NotFoundException(`Traffic job with ID "${dto.trafficJobId}" not found`);
    }

    const party = dto.party as ComplaintParty;
    if (!CHARGEABLE_PARTIES.includes(party)) {
      throw new BadRequestException(
        `A charge can only be raised against a driver, rep or supplier — not ${party}.`,
      );
    }

    const complaint = dto.complaintId
      ? await this.getComplaintForCharge(dto.complaintId, job.id, party)
      : null;

    // One live charge per party per job. A second would deduct twice for the
    // same fault; correcting the amount is what `update` is for.
    const existing = await this.prisma.complaintCharge.findFirst({
      where: { trafficJobId: job.id, party, status: { not: 'VOID' } },
    });
    if (existing) {
      throw new BadRequestException(
        `Job ${job.internalRef} already deducts from the ${party.toLowerCase()} (${existing.status}). Change that deduction, or void it before raising another.`,
      );
    }

    const partyId = this.assertExactlyOnePartyId(party, dto);
    await this.assertPartyExists(party, partyId);
    this.assertWorkedTheJob(job, party, partyId);

    const charge = await this.prisma.complaintCharge.create({
      data: {
        trafficJobId: job.id,
        complaintId: complaint?.id ?? null,
        party,
        driverId: party === 'DRIVER' ? partyId : null,
        repId: party === 'REP' ? partyId : null,
        supplierId: party === 'SUPPLIER' ? partyId : null,
        amount: dto.amount,
        currency: (dto.currency as Currency) ?? complaint?.currency ?? 'EGP',
        reason: dto.reason?.trim() || null,
        createdById: userId,
      },
      include: this.chargeInclude,
    });

    this.logger.log(
      `Deduction raised on job ${job.internalRef}${
        complaint ? ` (complaint ${complaint.complaintNo})` : ' (no complaint yet)'
      }: ${dto.amount} ${charge.currency} against ${party}`,
    );

    return charge;
  }

  /** Every deduction standing on a job, newest first. Powers the dispatch grid. */
  async findByJob(trafficJobId: string) {
    return this.prisma.complaintCharge.findMany({
      where: { trafficJobId },
      orderBy: { createdAt: 'desc' },
      include: {
        ...this.chargeInclude,
        complaint: { select: { id: true, complaintNo: true, subject: true } },
      },
    });
  }

  /**
   * A complaint adopts the deductions already standing on its job.
   *
   * Called straight after complaint creation: whatever the dispatcher docked
   * earlier becomes the new complaint's party charge, so the amount is never
   * typed twice and never lost. Only the parties the complaint
   * actually blames are adopted — docking the driver does not make a complaint
   * about the rep into a complaint about the driver — and only charges no other
   * complaint has already claimed.
   */
  async attachToComplaint(
    complaintId: string,
    trafficJobId: string,
    parties: ComplaintParty[],
  ): Promise<number> {
    const chargeable = parties.filter((p) => CHARGEABLE_PARTIES.includes(p));
    if (chargeable.length === 0) return 0;

    const { count } = await this.prisma.complaintCharge.updateMany({
      where: {
        trafficJobId,
        complaintId: null,
        status: { not: 'VOID' },
        party: { in: chargeable },
      },
      data: { complaintId },
    });

    if (count > 0) {
      this.logger.log(
        `Complaint ${complaintId} adopted ${count} deduction(s) already raised on job ${trafficJobId}`,
      );
    }
    return count;
  }

  /**
   * Overrides a deduction still awaiting approval — the amount typed on the
   * dispatch grid, corrected on the complaint. An approved charge is what was
   * approved; it can only be voided and raised again.
   */
  async update(chargeId: string, dto: UpdateComplaintChargeDto) {
    const charge = await this.getCharge(chargeId);
    if (charge.status !== 'PENDING') {
      throw new BadRequestException(
        `Only a PENDING charge can be changed; this one is ${charge.status}. Void it and raise another.`,
      );
    }

    return this.prisma.complaintCharge.update({
      where: { id: charge.id },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency as Currency } : {}),
        ...(dto.reason !== undefined ? { reason: dto.reason.trim() || null } : {}),
      },
      include: this.chargeInclude,
    });
  }

  async approve(chargeId: string, userId: string) {
    const charge = await this.getCharge(chargeId);
    if (charge.status !== 'PENDING') {
      throw new BadRequestException(
        `Only a PENDING charge can be approved; this one is ${charge.status}.`,
      );
    }

    return this.prisma.complaintCharge.update({
      where: { id: charge.id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
      include: this.chargeInclude,
    });
  }

  /**
   * The only step that moves money. Writes one negative-amount row into the
   * party's fee table for the complaint's job, left unposted so the usual
   * period-close flow still governs when it is actually paid out.
   */
  async post(chargeId: string) {
    const charge = await this.getCharge(chargeId);
    if (charge.status !== 'APPROVED') {
      throw new BadRequestException(
        `A charge must be APPROVED before it can be posted; this one is ${charge.status}.`,
      );
    }

    // The job is on the charge itself, so a deduction raised from the grid
    // posts exactly like one raised from a complaint.
    const [complaint, job] = await Promise.all([
      charge.complaintId
        ? this.prisma.complaint.findUnique({
            where: { id: charge.complaintId },
            select: { complaintNo: true },
          })
        : null,
      this.prisma.trafficJob.findUnique({
        where: { id: charge.trafficJobId },
        select: { internalRef: true },
      }),
    ]);

    const amount = Number(charge.amount);
    const description = complaint
      ? `Complaint ${complaint.complaintNo}`
      : `Deduction on job ${job?.internalRef ?? charge.trafficJobId}`;

    const feeId = await this.prisma.$transaction(async (tx) => {
      if (charge.party === 'DRIVER') {
        const fee = await tx.driverTripFee.create({
          data: {
            driverId: charge.driverId!,
            trafficJobId: charge.trafficJobId,
            amount: -amount,
            currency: charge.currency,
            isPosted: false,
          },
        });
        return fee.id;
      }

      if (charge.party === 'REP') {
        const fee = await tx.repFee.create({
          data: {
            repId: charge.repId!,
            trafficJobId: charge.trafficJobId,
            amount: -amount,
            currency: charge.currency,
            isPosted: false,
          },
        });
        return fee.id;
      }

      const cost = await tx.supplierCost.create({
        data: {
          supplierId: charge.supplierId!,
          trafficJobId: charge.trafficJobId,
          amount: -amount,
          currency: charge.currency,
          isPosted: false,
        },
      });
      return cost.id;
    });

    this.logger.log(
      `${description}: posted a ${-amount} ${charge.currency} row for ${charge.party} (fee ${feeId})`,
    );

    return this.prisma.complaintCharge.update({
      where: { id: charge.id },
      data: { status: 'POSTED', postedAt: new Date(), postedFeeId: feeId },
      include: this.chargeInclude,
    });
  }

  /**
   * Reverses a charge. An unposted one simply becomes VOID; a posted one has
   * its fee row deleted while still unposted, or — once the fee has been paid
   * out — gets a compensating positive row so the party's total is made whole.
   */
  async void(chargeId: string, dto: VoidComplaintChargeDto) {
    const charge = await this.getCharge(chargeId);
    if (charge.status === 'VOID') {
      throw new BadRequestException('This charge is already void.');
    }

    if (charge.status === 'POSTED' && charge.postedFeeId) {
      await this.reverseFeeRow(charge.party, charge.postedFeeId, Number(charge.amount));
    }

    return this.prisma.complaintCharge.update({
      where: { id: charge.id },
      data: { status: 'VOID', voidedAt: new Date(), voidReason: dto.reason },
      include: this.chargeInclude,
    });
  }

  private async reverseFeeRow(
    party: ComplaintParty,
    feeId: string,
    amount: number,
  ): Promise<void> {
    if (party === 'DRIVER') {
      const fee = await this.prisma.driverTripFee.findUnique({ where: { id: feeId } });
      if (!fee) return;
      if (!fee.isPosted) {
        await this.prisma.driverTripFee.delete({ where: { id: feeId } });
        return;
      }
      await this.prisma.driverTripFee.create({
        data: {
          driverId: fee.driverId,
          trafficJobId: fee.trafficJobId,
          amount,
          currency: fee.currency,
          isPosted: false,
        },
      });
      return;
    }

    if (party === 'REP') {
      const fee = await this.prisma.repFee.findUnique({ where: { id: feeId } });
      if (!fee) return;
      if (!fee.isPosted) {
        await this.prisma.repFee.delete({ where: { id: feeId } });
        return;
      }
      await this.prisma.repFee.create({
        data: {
          repId: fee.repId,
          trafficJobId: fee.trafficJobId,
          amount,
          currency: fee.currency,
          isPosted: false,
        },
      });
      return;
    }

    const cost = await this.prisma.supplierCost.findUnique({ where: { id: feeId } });
    if (!cost) return;
    if (!cost.isPosted) {
      await this.prisma.supplierCost.delete({ where: { id: feeId } });
      return;
    }
    await this.prisma.supplierCost.create({
      data: {
        supplierId: cost.supplierId,
        trafficJobId: cost.trafficJobId,
        amount,
        currency: cost.currency,
        isPosted: false,
      },
    });
  }

  private readonly chargeInclude = {
    driver: { select: { id: true, name: true } },
    rep: { select: { id: true, name: true } },
    supplier: { select: { id: true, legalName: true, tradeName: true } },
    approvedBy: { select: { id: true, name: true } },
  };

  private async getCharge(chargeId: string) {
    const charge = await this.prisma.complaintCharge.findUnique({
      where: { id: chargeId },
    });
    if (!charge) {
      throw new NotFoundException(`Deduction with ID "${chargeId}" not found`);
    }
    return charge;
  }

  /**
   * The complaint a charge is being raised under. It has to be the job's own
   * complaint, and it has to blame the party being docked — the same rule the
   * responsible ids obey, so the dispatch grid and the charge panel can never
   * disagree about who is on the hook.
   */
  private async getComplaintForCharge(
    complaintId: string,
    trafficJobId: string,
    party: ComplaintParty,
  ) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id: complaintId, deletedAt: null },
    });
    if (!complaint) {
      throw new NotFoundException(`Complaint with ID "${complaintId}" not found`);
    }
    if (complaint.trafficJobId !== trafficJobId) {
      throw new BadRequestException(
        `Complaint ${complaint.complaintNo} is not about this job.`,
      );
    }

    const blamed =
      complaint.responsibleParties.length > 0
        ? complaint.responsibleParties
        : ([complaint.responsibleParty].filter(Boolean) as ComplaintParty[]);
    if (!blamed.includes(party)) {
      throw new BadRequestException(
        `Complaint ${complaint.complaintNo} does not blame the ${party.toLowerCase()}, so nothing can be deducted from them.`,
      );
    }

    return complaint;
  }

  /**
   * Money can only be taken from someone who actually worked the job. Without
   * this the grid could dock a driver who was never on it.
   */
  private assertWorkedTheJob(
    job: {
      internalRef: string;
      assignment: { driverId: string | null; repId: string | null; supplierId: string | null } | null;
    },
    party: ComplaintParty,
    partyId: string,
  ): void {
    const onTheJob =
      party === 'DRIVER'
        ? job.assignment?.driverId
        : party === 'REP'
          ? job.assignment?.repId
          : job.assignment?.supplierId;

    if (onTheJob !== partyId) {
      throw new BadRequestException(
        `That ${party.toLowerCase()} did not work job ${job.internalRef}, so nothing can be deducted from them for it.`,
      );
    }
  }

  /**
   * A charge is against one person. The complaint may blame three, but each of
   * them gets their own row, so exactly one id belongs on any single charge.
   */
  private assertExactlyOnePartyId(
    party: ComplaintParty,
    dto: CreateComplaintChargeDto,
  ): string {
    const given = [dto.driverId, dto.repId, dto.supplierId].filter(Boolean);
    if (given.length !== 1) {
      throw new BadRequestException(
        'Name exactly one of driverId, repId or supplierId on the charge.',
      );
    }

    const expected =
      party === 'DRIVER' ? dto.driverId : party === 'REP' ? dto.repId : dto.supplierId;
    if (!expected) {
      throw new BadRequestException(
        `The charge is against a ${party.toLowerCase()}, so the matching id is required.`,
      );
    }
    return expected;
  }

  private async assertPartyExists(party: ComplaintParty, id: string): Promise<void> {
    const found =
      party === 'DRIVER'
        ? await this.prisma.driver.findFirst({ where: { id, deletedAt: null } })
        : party === 'REP'
          ? await this.prisma.rep.findFirst({ where: { id, deletedAt: null } })
          : await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });

    if (!found) {
      throw new NotFoundException(`${party} with ID "${id}" not found`);
    }
  }
}
