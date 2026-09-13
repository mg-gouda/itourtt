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
 * A complaint blames several people at once, so it carries **one charge per
 * party** — a job a rep and a driver both spoiled deducts from both, and each
 * charge is approved, posted and voided on its own. What is not allowed is two
 * live charges against the same party: void the first, or override its amount
 * while it is still PENDING.
 */
@Injectable()
export class ComplaintChargesService {
  private readonly logger = new Logger(ComplaintChargesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(complaintId: string, dto: CreateComplaintChargeDto, userId: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id: complaintId, deletedAt: null },
      include: { charges: true },
    });
    if (!complaint) {
      throw new NotFoundException(`Complaint with ID "${complaintId}" not found`);
    }

    const party = dto.party as ComplaintParty;

    // A deduction can only fall on someone the complaint actually blames —
    // the same rule the responsible ids obey, so the dispatch grid and the
    // charge panel can never disagree about who is on the hook.
    const blamed =
      complaint.responsibleParties.length > 0
        ? complaint.responsibleParties
        : ([complaint.responsibleParty].filter(Boolean) as ComplaintParty[]);
    if (!blamed.includes(party)) {
      throw new BadRequestException(
        `Complaint ${complaint.complaintNo} does not blame the ${party.toLowerCase()}, so nothing can be deducted from them.`,
      );
    }

    // One live charge per party. A second one would deduct twice for the same
    // fault; correcting the amount is what `update` is for.
    const existing = complaint.charges.find(
      (c) => c.party === party && c.status !== 'VOID',
    );
    if (existing) {
      throw new BadRequestException(
        `Complaint ${complaint.complaintNo} already charges the ${party.toLowerCase()} (${existing.status}). Change that charge, or void it before raising another.`,
      );
    }

    if (!CHARGEABLE_PARTIES.includes(party)) {
      throw new BadRequestException(
        `A charge can only be raised against a driver, rep or supplier — not ${party}.`,
      );
    }

    const partyId = this.assertExactlyOnePartyId(party, dto);
    await this.assertPartyExists(party, partyId);

    const charge = await this.prisma.complaintCharge.create({
      data: {
        complaintId,
        party,
        driverId: party === 'DRIVER' ? partyId : null,
        repId: party === 'REP' ? partyId : null,
        supplierId: party === 'SUPPLIER' ? partyId : null,
        amount: dto.amount,
        currency: (dto.currency as Currency) ?? complaint.currency,
        reason: dto.reason?.trim() || null,
        createdById: userId,
      },
      include: this.chargeInclude,
    });

    this.logger.log(
      `Charge raised on complaint ${complaint.complaintNo}: ${dto.amount} ${charge.currency} against ${party}`,
    );

    return charge;
  }

  /**
   * Overrides a deduction still awaiting approval — the amount typed on the
   * dispatch grid, corrected on the complaint. An approved charge is what was
   * approved; it can only be voided and raised again.
   */
  async update(complaintId: string, chargeId: string, dto: UpdateComplaintChargeDto) {
    const charge = await this.getCharge(complaintId, chargeId);
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

  async approve(complaintId: string, chargeId: string, userId: string) {
    const charge = await this.getCharge(complaintId, chargeId);
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
  async post(complaintId: string, chargeId: string) {
    const charge = await this.getCharge(complaintId, chargeId);
    if (charge.status !== 'APPROVED') {
      throw new BadRequestException(
        `A charge must be APPROVED before it can be posted; this one is ${charge.status}.`,
      );
    }

    const complaint = await this.prisma.complaint.findUniqueOrThrow({
      where: { id: complaintId },
      select: { trafficJobId: true, complaintNo: true },
    });

    const amount = Number(charge.amount);
    const description = `Complaint ${complaint.complaintNo}`;

    const feeId = await this.prisma.$transaction(async (tx) => {
      if (charge.party === 'DRIVER') {
        const fee = await tx.driverTripFee.create({
          data: {
            driverId: charge.driverId!,
            trafficJobId: complaint.trafficJobId,
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
            trafficJobId: complaint.trafficJobId,
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
          trafficJobId: complaint.trafficJobId,
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
  async void(complaintId: string, chargeId: string, dto: VoidComplaintChargeDto) {
    const charge = await this.getCharge(complaintId, chargeId);
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

  private async getCharge(complaintId: string, chargeId: string) {
    const charge = await this.prisma.complaintCharge.findFirst({
      where: { id: chargeId, complaintId },
    });
    if (!charge) {
      throw new NotFoundException('This complaint has no such charge to act on.');
    }
    return charge;
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
