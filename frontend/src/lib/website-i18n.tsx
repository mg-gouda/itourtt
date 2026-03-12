"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Locale = "en" | "ar" | "de" | "fr" | "it" | "nl" | "ru";

export interface Language {
  code: Locale;
  label: string;
  dir: "ltr" | "rtl";
}

/* ------------------------------------------------------------------ */
/*  LANGUAGES array                                                    */
/* ------------------------------------------------------------------ */

export const LANGUAGES: Language[] = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "de", label: "Deutsch", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "it", label: "Italiano", dir: "ltr" },
  { code: "nl", label: "Nederlands", dir: "ltr" },
  { code: "ru", label: "Русский", dir: "ltr" },
];

/* ------------------------------------------------------------------ */
/*  Zustand store                                                      */
/* ------------------------------------------------------------------ */

interface LocaleStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleStore>()(
  persist(
    (set) => ({
      locale: "en",
      setLocale: (locale: Locale) => set({ locale }),
    }),
    { name: "website-locale" }
  )
);

/* ------------------------------------------------------------------ */
/*  Translations                                                       */
/* ------------------------------------------------------------------ */

const translations: Record<Locale, Record<string, string>> = {
  /* ============================  ENGLISH  ============================ */
  en: {
    // Navigation
    "nav.home": "Home",
    "nav.bookNow": "Book Now",
    "nav.trackBooking": "Track Booking",
    "nav.menu": "Menu",

    // Booking Widget
    "booking.arrivalTransfer": "Arrival Transfer",
    "booking.departureTransfer": "Departure Transfer",
    "booking.arrivalAirport": "Arrival Airport",
    "booking.departureAirport": "Departure Airport",
    "booking.selectAirport": "Select airport",
    "booking.date": "Date",
    "booking.time": "Time",
    "booking.passengers": "Passengers",
    "booking.luggage": "Luggage",
    "booking.pickupAirport": "Pickup (Airport Area)",
    "booking.pickupHotel": "Pickup (Hotel / Address)",
    "booking.dropoffHotel": "Drop-off (Hotel / Address)",
    "booking.dropoffAirport": "Drop-off (Airport Area)",
    "booking.searchLocation": "Search location...",
    "booking.babySeat": "Baby Seat",
    "booking.boosterSeat": "Booster Seat",
    "booking.wheelchair": "Wheelchair",
    "booking.getQuote": "Get Instant Quote",
    "booking.gettingQuote": "Getting Quote...",
    "booking.yourPrice": "Your Price",
    "booking.bookNow": "Book Now",

    // Landing Page
    "landing.howItWorks": "How It Works",
    "landing.threeSteps": "Book your transfer in three simple steps",
    "landing.step1Title": "Search",
    "landing.step1Desc":
      "Enter your trip details — pickup, drop-off, date, and passengers — to get an instant price quote.",
    "landing.step2Title": "Book & Pay",
    "landing.step2Desc":
      "Fill in your details, choose extras if needed, and pay securely online or opt to pay on arrival.",
    "landing.step3Title": "Travel",
    "landing.step3Desc":
      "Receive your confirmation, meet your driver at the airport, and enjoy a smooth, comfortable transfer.",
    "landing.happyTravelers": "Happy Travelers",
    "landing.onTimeRate": "On-Time Rate",
    "landing.customerSupport": "Customer Support",
    "landing.averageRating": "Average Rating",
    "landing.guestsSay": "What Our Guests Say",
    "landing.theDifference": "The Difference",
    "landing.noHiddenFees": "No hidden fees — transparent pricing",
    "landing.freeCancellation": "Free cancellation up to 24 hours before",
    "landing.flightTracking": "Real-time flight tracking for arrivals",
    "landing.proDrivers": "Professional, English-speaking drivers",
    "landing.modernVehicles": "Modern, air-conditioned vehicles",
    "landing.doorToDoor": "Door-to-door service across Egypt",
    "landing.readyToBook": "Ready to Book Your Transfer?",
    "landing.instantQuote":
      "Get an instant quote and book in under 2 minutes",

    // Track Booking
    "track.title": "Track Your Booking",
    "track.enterRef":
      "Enter your booking reference to check the status of your transfer.",
    "track.reference": "Booking Reference",
    "track.placeholder": "e.g. GB-240101-0001",
    "track.search": "Track",
    "track.notFound": "Booking not found. Please check the reference and try again.",
    "track.bookingDetails": "Booking Details",
    "track.tripInfo": "Trip Information",
    "track.guestInfo": "Guest Information",
    "track.flightDetails": "Flight Details",
    "track.payment": "Payment",
    "track.service": "Service",
    "track.date": "Date",
    "track.pickupTime": "Pickup Time",
    "track.passengers": "Passengers",
    "track.from": "From",
    "track.to": "To",
    "track.hotel": "Hotel",
    "track.vehicle": "Vehicle",
    "track.name": "Name",
    "track.email": "Email",
    "track.phone": "Phone",
    "track.country": "Country",
    "track.flight": "Flight",
    "track.airline": "Airline",
    "track.terminal": "Terminal",
    "track.method": "Method",
    "track.status": "Status",
    "track.total": "Total",
    "track.notes": "Notes",
    "track.payOnArrival": "Pay on Arrival",
    "track.onlinePayment": "Online Payment",
    "track.cancelBooking": "Cancel Booking",
    "track.bookingConfirmed": "Your booking has been confirmed and a driver will be assigned. Driver details will be shared via email before your pickup time.",
    "track.bookingCancelled": "This booking has been cancelled.",
    "track.enterRefAbove": "Enter your booking reference above to view your booking details.",
    "track.statusPending": "Pending",
    "track.statusConfirmed": "Confirmed",
    "track.statusAssigned": "Driver Assigned",
    "track.statusCompleted": "Completed",
    "track.statusCancelled": "Cancelled",
    "track.statusConverted": "Converted to Job",

    // Footer
    "footer.quickLinks": "Quick Links",
    "footer.contactUs": "Contact Us",
    "footer.stayConnected": "Stay Connected",
    "footer.followUs":
      "Follow us on social media for updates, travel tips, and special offers.",
    "footer.rights": "All rights reserved.",
    "footer.about":
      "Professional airport transfer and transportation services across Egypt.",

    // Common
    "common.loading": "Loading...",
    "common.error": "Something went wrong",
    "common.bookAnother": "Book Another Transfer",
    "common.step": "Step",
  },

  /* ============================  ARABIC  ============================= */
  ar: {
    // Navigation
    "nav.home": "الرئيسية",
    "nav.bookNow": "احجز الآن",
    "nav.trackBooking": "تتبع الحجز",
    "nav.menu": "القائمة",

    // Booking Widget
    "booking.arrivalTransfer": "انتقال الوصول",
    "booking.departureTransfer": "انتقال المغادرة",
    "booking.arrivalAirport": "مطار الوصول",
    "booking.departureAirport": "مطار المغادرة",
    "booking.selectAirport": "اختر المطار",
    "booking.date": "التاريخ",
    "booking.time": "الوقت",
    "booking.passengers": "الركاب",
    "booking.luggage": "الأمتعة",
    "booking.pickupAirport": "الاستلام (منطقة المطار)",
    "booking.pickupHotel": "الاستلام (فندق / عنوان)",
    "booking.dropoffHotel": "التوصيل (فندق / عنوان)",
    "booking.dropoffAirport": "التوصيل (منطقة المطار)",
    "booking.searchLocation": "ابحث عن الموقع...",
    "booking.babySeat": "مقعد أطفال رضّع",
    "booking.boosterSeat": "مقعد أطفال مرتفع",
    "booking.wheelchair": "كرسي متحرك",
    "booking.getQuote": "احصل على عرض سعر فوري",
    "booking.gettingQuote": "جارٍ الحصول على عرض السعر...",
    "booking.yourPrice": "السعر الخاص بك",
    "booking.bookNow": "احجز الآن",

    // Landing Page
    "landing.howItWorks": "كيف يعمل",
    "landing.threeSteps": "احجز رحلتك في ثلاث خطوات بسيطة",
    "landing.step1Title": "ابحث",
    "landing.step1Desc":
      "أدخل تفاصيل رحلتك — نقطة الاستلام والتوصيل والتاريخ وعدد الركاب — للحصول على عرض سعر فوري.",
    "landing.step2Title": "احجز وادفع",
    "landing.step2Desc":
      "أدخل بياناتك، واختر الإضافات إن لزم الأمر، وادفع بأمان عبر الإنترنت أو اختر الدفع عند الوصول.",
    "landing.step3Title": "سافر",
    "landing.step3Desc":
      "استلم تأكيد حجزك، وقابل سائقك في المطار، واستمتع برحلة سلسة ومريحة.",
    "landing.happyTravelers": "مسافرون سعداء",
    "landing.onTimeRate": "نسبة الالتزام بالمواعيد",
    "landing.customerSupport": "دعم العملاء",
    "landing.averageRating": "متوسط التقييم",
    "landing.guestsSay": "ماذا يقول ضيوفنا",
    "landing.theDifference": "ما يميزنا",
    "landing.noHiddenFees": "لا رسوم خفية — أسعار شفافة",
    "landing.freeCancellation": "إلغاء مجاني حتى 24 ساعة قبل الموعد",
    "landing.flightTracking": "تتبع الرحلات الجوية في الوقت الفعلي",
    "landing.proDrivers": "سائقون محترفون يتحدثون الإنجليزية",
    "landing.modernVehicles": "مركبات حديثة مكيّفة الهواء",
    "landing.doorToDoor": "خدمة من الباب إلى الباب في جميع أنحاء مصر",
    "landing.readyToBook": "مستعد لحجز رحلتك؟",
    "landing.instantQuote": "احصل على عرض سعر فوري واحجز في أقل من دقيقتين",

    // Track Booking
    "track.title": "تتبع حجزك",
    "track.enterRef":
      "أدخل رقم الحجز المرجعي للتحقق من حالة رحلتك.",
    "track.reference": "رقم الحجز المرجعي",
    "track.placeholder": "مثال: GB-240101-0001",
    "track.search": "تتبع",
    "track.notFound": "لم يتم العثور على الحجز. يرجى التحقق من الرقم المرجعي والمحاولة مرة أخرى.",
    "track.bookingDetails": "تفاصيل الحجز",
    "track.tripInfo": "معلومات الرحلة",
    "track.guestInfo": "معلومات الضيف",
    "track.flightDetails": "تفاصيل الرحلة الجوية",
    "track.payment": "الدفع",
    "track.service": "الخدمة",
    "track.date": "التاريخ",
    "track.pickupTime": "وقت الاستلام",
    "track.passengers": "الركاب",
    "track.from": "من",
    "track.to": "إلى",
    "track.hotel": "الفندق",
    "track.vehicle": "المركبة",
    "track.name": "الاسم",
    "track.email": "البريد الإلكتروني",
    "track.phone": "الهاتف",
    "track.country": "الدولة",
    "track.flight": "الرحلة",
    "track.airline": "شركة الطيران",
    "track.terminal": "الصالة",
    "track.method": "طريقة الدفع",
    "track.status": "الحالة",
    "track.total": "الإجمالي",
    "track.notes": "ملاحظات",
    "track.payOnArrival": "الدفع عند الوصول",
    "track.onlinePayment": "الدفع عبر الإنترنت",
    "track.cancelBooking": "إلغاء الحجز",
    "track.bookingConfirmed": "تم تأكيد حجزك وسيتم تعيين سائق. سيتم مشاركة تفاصيل السائق عبر البريد الإلكتروني قبل موعد الاستلام.",
    "track.bookingCancelled": "تم إلغاء هذا الحجز.",
    "track.enterRefAbove": "أدخل رقم الحجز المرجعي أعلاه لعرض تفاصيل حجزك.",
    "track.statusPending": "قيد الانتظار",
    "track.statusConfirmed": "مؤكد",
    "track.statusAssigned": "تم تعيين سائق",
    "track.statusCompleted": "مكتمل",
    "track.statusCancelled": "ملغي",
    "track.statusConverted": "تم التحويل إلى مهمة",

    // Footer
    "footer.quickLinks": "روابط سريعة",
    "footer.contactUs": "اتصل بنا",
    "footer.stayConnected": "ابقَ على تواصل",
    "footer.followUs":
      "تابعنا على وسائل التواصل الاجتماعي للحصول على التحديثات ونصائح السفر والعروض الخاصة.",
    "footer.rights": "جميع الحقوق محفوظة.",
    "footer.about":
      "خدمات نقل احترافية من وإلى المطار في جميع أنحاء مصر.",

    // Common
    "common.loading": "جارٍ التحميل...",
    "common.error": "حدث خطأ ما",
    "common.bookAnother": "احجز رحلة أخرى",
    "common.step": "الخطوة",
  },

  /* ============================  GERMAN  ============================= */
  de: {
    // Navigation
    "nav.home": "Startseite",
    "nav.bookNow": "Jetzt buchen",
    "nav.trackBooking": "Buchung verfolgen",
    "nav.menu": "Menü",

    // Booking Widget
    "booking.arrivalTransfer": "Ankunftstransfer",
    "booking.departureTransfer": "Abflugtransfer",
    "booking.arrivalAirport": "Ankunftsflughafen",
    "booking.departureAirport": "Abflughafen",
    "booking.selectAirport": "Flughafen auswählen",
    "booking.date": "Datum",
    "booking.time": "Uhrzeit",
    "booking.passengers": "Passagiere",
    "booking.luggage": "Gepäck",
    "booking.pickupAirport": "Abholung (Flughafenbereich)",
    "booking.pickupHotel": "Abholung (Hotel / Adresse)",
    "booking.dropoffHotel": "Absetzen (Hotel / Adresse)",
    "booking.dropoffAirport": "Absetzen (Flughafenbereich)",
    "booking.searchLocation": "Ort suchen...",
    "booking.babySeat": "Babysitz",
    "booking.boosterSeat": "Kindersitzerhöhung",
    "booking.wheelchair": "Rollstuhl",
    "booking.getQuote": "Sofortangebot erhalten",
    "booking.gettingQuote": "Angebot wird erstellt...",
    "booking.yourPrice": "Ihr Preis",
    "booking.bookNow": "Jetzt buchen",

    // Landing Page
    "landing.howItWorks": "So funktioniert es",
    "landing.threeSteps": "Buchen Sie Ihren Transfer in drei einfachen Schritten",
    "landing.step1Title": "Suchen",
    "landing.step1Desc":
      "Geben Sie Ihre Reisedetails ein — Abholung, Ziel, Datum und Passagieranzahl — und erhalten Sie sofort ein Preisangebot.",
    "landing.step2Title": "Buchen & Bezahlen",
    "landing.step2Desc":
      "Geben Sie Ihre Daten ein, wählen Sie bei Bedarf Extras und bezahlen Sie sicher online oder bei Ankunft.",
    "landing.step3Title": "Reisen",
    "landing.step3Desc":
      "Erhalten Sie Ihre Bestätigung, treffen Sie Ihren Fahrer am Flughafen und genießen Sie einen komfortablen Transfer.",
    "landing.happyTravelers": "Zufriedene Reisende",
    "landing.onTimeRate": "Pünktlichkeitsrate",
    "landing.customerSupport": "Kundenservice",
    "landing.averageRating": "Durchschnittliche Bewertung",
    "landing.guestsSay": "Was unsere Gäste sagen",
    "landing.theDifference": "Der Unterschied",
    "landing.noHiddenFees": "Keine versteckten Gebühren — transparente Preise",
    "landing.freeCancellation":
      "Kostenlose Stornierung bis 24 Stunden vorher",
    "landing.flightTracking":
      "Echtzeit-Flugverfolgung bei Ankünften",
    "landing.proDrivers": "Professionelle, englischsprachige Fahrer",
    "landing.modernVehicles": "Moderne, klimatisierte Fahrzeuge",
    "landing.doorToDoor": "Tür-zu-Tür-Service in ganz Ägypten",
    "landing.readyToBook": "Bereit, Ihren Transfer zu buchen?",
    "landing.instantQuote":
      "Erhalten Sie ein Sofortangebot und buchen Sie in unter 2 Minuten",

    // Track Booking
    "track.title": "Buchung verfolgen",
    "track.enterRef":
      "Geben Sie Ihre Buchungsreferenz ein, um den Status Ihres Transfers zu prüfen.",
    "track.reference": "Buchungsreferenz",
    "track.placeholder": "z. B. GB-240101-0001",
    "track.search": "Verfolgen",
    "track.notFound": "Buchung nicht gefunden. Bitte überprüfen Sie die Referenz und versuchen Sie es erneut.",
    "track.bookingDetails": "Buchungsdetails",
    "track.tripInfo": "Reiseinformationen",
    "track.guestInfo": "Gastinformationen",
    "track.flightDetails": "Flugdetails",
    "track.payment": "Zahlung",
    "track.service": "Service",
    "track.date": "Datum",
    "track.pickupTime": "Abholzeit",
    "track.passengers": "Passagiere",
    "track.from": "Von",
    "track.to": "Nach",
    "track.hotel": "Hotel",
    "track.vehicle": "Fahrzeug",
    "track.name": "Name",
    "track.email": "E-Mail",
    "track.phone": "Telefon",
    "track.country": "Land",
    "track.flight": "Flug",
    "track.airline": "Fluggesellschaft",
    "track.terminal": "Terminal",
    "track.method": "Zahlungsart",
    "track.status": "Status",
    "track.total": "Gesamt",
    "track.notes": "Anmerkungen",
    "track.payOnArrival": "Zahlung bei Ankunft",
    "track.onlinePayment": "Online-Zahlung",
    "track.cancelBooking": "Buchung stornieren",
    "track.bookingConfirmed": "Ihre Buchung wurde bestätigt und ein Fahrer wird zugewiesen. Die Fahrerdetails werden Ihnen vor der Abholzeit per E-Mail mitgeteilt.",
    "track.bookingCancelled": "Diese Buchung wurde storniert.",
    "track.enterRefAbove": "Geben Sie oben Ihre Buchungsreferenz ein, um Ihre Buchungsdetails anzuzeigen.",
    "track.statusPending": "Ausstehend",
    "track.statusConfirmed": "Bestätigt",
    "track.statusAssigned": "Fahrer zugewiesen",
    "track.statusCompleted": "Abgeschlossen",
    "track.statusCancelled": "Storniert",
    "track.statusConverted": "In Auftrag umgewandelt",

    // Footer
    "footer.quickLinks": "Schnellzugriff",
    "footer.contactUs": "Kontakt",
    "footer.stayConnected": "Bleiben Sie verbunden",
    "footer.followUs":
      "Folgen Sie uns in den sozialen Medien für Updates, Reisetipps und Sonderangebote.",
    "footer.rights": "Alle Rechte vorbehalten.",
    "footer.about":
      "Professionelle Flughafentransfer- und Transportdienste in ganz Ägypten.",

    // Common
    "common.loading": "Wird geladen...",
    "common.error": "Etwas ist schiefgelaufen",
    "common.bookAnother": "Einen weiteren Transfer buchen",
    "common.step": "Schritt",
  },

  /* ============================  FRENCH  ============================= */
  fr: {
    // Navigation
    "nav.home": "Accueil",
    "nav.bookNow": "Réserver",
    "nav.trackBooking": "Suivre la réservation",
    "nav.menu": "Menu",

    // Booking Widget
    "booking.arrivalTransfer": "Transfert d'arrivée",
    "booking.departureTransfer": "Transfert de départ",
    "booking.arrivalAirport": "Aéroport d'arrivée",
    "booking.departureAirport": "Aéroport de départ",
    "booking.selectAirport": "Sélectionner un aéroport",
    "booking.date": "Date",
    "booking.time": "Heure",
    "booking.passengers": "Passagers",
    "booking.luggage": "Bagages",
    "booking.pickupAirport": "Prise en charge (zone aéroport)",
    "booking.pickupHotel": "Prise en charge (hôtel / adresse)",
    "booking.dropoffHotel": "Dépose (hôtel / adresse)",
    "booking.dropoffAirport": "Dépose (zone aéroport)",
    "booking.searchLocation": "Rechercher un lieu...",
    "booking.babySeat": "Siège bébé",
    "booking.boosterSeat": "Siège rehausseur",
    "booking.wheelchair": "Fauteuil roulant",
    "booking.getQuote": "Obtenir un devis instantané",
    "booking.gettingQuote": "Devis en cours...",
    "booking.yourPrice": "Votre prix",
    "booking.bookNow": "Réserver",

    // Landing Page
    "landing.howItWorks": "Comment ça marche",
    "landing.threeSteps":
      "Réservez votre transfert en trois étapes simples",
    "landing.step1Title": "Rechercher",
    "landing.step1Desc":
      "Entrez les détails de votre trajet — prise en charge, dépose, date et nombre de passagers — pour obtenir un devis instantané.",
    "landing.step2Title": "Réserver et payer",
    "landing.step2Desc":
      "Renseignez vos informations, choisissez des options si nécessaire, et payez en ligne en toute sécurité ou à l'arrivée.",
    "landing.step3Title": "Voyager",
    "landing.step3Desc":
      "Recevez votre confirmation, retrouvez votre chauffeur à l'aéroport et profitez d'un transfert confortable.",
    "landing.happyTravelers": "Voyageurs satisfaits",
    "landing.onTimeRate": "Taux de ponctualité",
    "landing.customerSupport": "Service client",
    "landing.averageRating": "Note moyenne",
    "landing.guestsSay": "Ce que disent nos clients",
    "landing.theDifference": "La différence",
    "landing.noHiddenFees":
      "Aucun frais caché — tarification transparente",
    "landing.freeCancellation":
      "Annulation gratuite jusqu'à 24 heures avant",
    "landing.flightTracking":
      "Suivi des vols en temps réel pour les arrivées",
    "landing.proDrivers":
      "Chauffeurs professionnels anglophones",
    "landing.modernVehicles": "Véhicules modernes et climatisés",
    "landing.doorToDoor":
      "Service porte-à-porte dans toute l'Égypte",
    "landing.readyToBook": "Prêt à réserver votre transfert ?",
    "landing.instantQuote":
      "Obtenez un devis instantané et réservez en moins de 2 minutes",

    // Track Booking
    "track.title": "Suivre votre réservation",
    "track.enterRef":
      "Entrez votre référence de réservation pour vérifier le statut de votre transfert.",
    "track.reference": "Référence de réservation",
    "track.placeholder": "ex. GB-240101-0001",
    "track.search": "Suivre",
    "track.notFound": "Réservation introuvable. Veuillez vérifier la référence et réessayer.",
    "track.bookingDetails": "Détails de la réservation",
    "track.tripInfo": "Informations sur le trajet",
    "track.guestInfo": "Informations sur le passager",
    "track.flightDetails": "Détails du vol",
    "track.payment": "Paiement",
    "track.service": "Service",
    "track.date": "Date",
    "track.pickupTime": "Heure de prise en charge",
    "track.passengers": "Passagers",
    "track.from": "De",
    "track.to": "À",
    "track.hotel": "Hôtel",
    "track.vehicle": "Véhicule",
    "track.name": "Nom",
    "track.email": "E-mail",
    "track.phone": "Téléphone",
    "track.country": "Pays",
    "track.flight": "Vol",
    "track.airline": "Compagnie aérienne",
    "track.terminal": "Terminal",
    "track.method": "Mode de paiement",
    "track.status": "Statut",
    "track.total": "Total",
    "track.notes": "Notes",
    "track.payOnArrival": "Paiement à l'arrivée",
    "track.onlinePayment": "Paiement en ligne",
    "track.cancelBooking": "Annuler la réservation",
    "track.bookingConfirmed": "Votre réservation a été confirmée et un chauffeur sera assigné. Les coordonnées du chauffeur vous seront envoyées par e-mail avant l'heure de prise en charge.",
    "track.bookingCancelled": "Cette réservation a été annulée.",
    "track.enterRefAbove": "Entrez votre référence de réservation ci-dessus pour consulter les détails de votre réservation.",
    "track.statusPending": "En attente",
    "track.statusConfirmed": "Confirmée",
    "track.statusAssigned": "Chauffeur assigné",
    "track.statusCompleted": "Terminée",
    "track.statusCancelled": "Annulée",
    "track.statusConverted": "Convertie en mission",

    // Footer
    "footer.quickLinks": "Liens rapides",
    "footer.contactUs": "Nous contacter",
    "footer.stayConnected": "Restez connecté",
    "footer.followUs":
      "Suivez-nous sur les réseaux sociaux pour des actualités, des conseils de voyage et des offres spéciales.",
    "footer.rights": "Tous droits réservés.",
    "footer.about":
      "Services professionnels de transfert aéroport et de transport dans toute l'Égypte.",

    // Common
    "common.loading": "Chargement...",
    "common.error": "Une erreur est survenue",
    "common.bookAnother": "Réserver un autre transfert",
    "common.step": "Étape",
  },

  /* ============================  ITALIAN  ============================ */
  it: {
    // Navigation
    "nav.home": "Home",
    "nav.bookNow": "Prenota ora",
    "nav.trackBooking": "Traccia prenotazione",
    "nav.menu": "Menu",

    // Booking Widget
    "booking.arrivalTransfer": "Transfer di arrivo",
    "booking.departureTransfer": "Transfer di partenza",
    "booking.arrivalAirport": "Aeroporto di arrivo",
    "booking.departureAirport": "Aeroporto di partenza",
    "booking.selectAirport": "Seleziona aeroporto",
    "booking.date": "Data",
    "booking.time": "Ora",
    "booking.passengers": "Passeggeri",
    "booking.luggage": "Bagagli",
    "booking.pickupAirport": "Ritiro (zona aeroporto)",
    "booking.pickupHotel": "Ritiro (hotel / indirizzo)",
    "booking.dropoffHotel": "Consegna (hotel / indirizzo)",
    "booking.dropoffAirport": "Consegna (zona aeroporto)",
    "booking.searchLocation": "Cerca località...",
    "booking.babySeat": "Seggiolino neonato",
    "booking.boosterSeat": "Rialzo per bambini",
    "booking.wheelchair": "Sedia a rotelle",
    "booking.getQuote": "Ottieni un preventivo istantaneo",
    "booking.gettingQuote": "Preventivo in corso...",
    "booking.yourPrice": "Il tuo prezzo",
    "booking.bookNow": "Prenota ora",

    // Landing Page
    "landing.howItWorks": "Come funziona",
    "landing.threeSteps":
      "Prenota il tuo transfer in tre semplici passaggi",
    "landing.step1Title": "Cerca",
    "landing.step1Desc":
      "Inserisci i dettagli del viaggio — ritiro, destinazione, data e passeggeri — per ottenere un preventivo istantaneo.",
    "landing.step2Title": "Prenota e paga",
    "landing.step2Desc":
      "Compila i tuoi dati, scegli gli extra se necessario e paga in sicurezza online o all'arrivo.",
    "landing.step3Title": "Viaggia",
    "landing.step3Desc":
      "Ricevi la conferma, incontra il tuo autista in aeroporto e goditi un transfer comodo e piacevole.",
    "landing.happyTravelers": "Viaggiatori soddisfatti",
    "landing.onTimeRate": "Tasso di puntualità",
    "landing.customerSupport": "Assistenza clienti",
    "landing.averageRating": "Valutazione media",
    "landing.guestsSay": "Cosa dicono i nostri ospiti",
    "landing.theDifference": "La differenza",
    "landing.noHiddenFees":
      "Nessun costo nascosto — prezzi trasparenti",
    "landing.freeCancellation":
      "Cancellazione gratuita fino a 24 ore prima",
    "landing.flightTracking":
      "Tracciamento voli in tempo reale per gli arrivi",
    "landing.proDrivers":
      "Autisti professionisti che parlano inglese",
    "landing.modernVehicles": "Veicoli moderni e climatizzati",
    "landing.doorToDoor":
      "Servizio porta a porta in tutto l'Egitto",
    "landing.readyToBook": "Pronto a prenotare il tuo transfer?",
    "landing.instantQuote":
      "Ottieni un preventivo istantaneo e prenota in meno di 2 minuti",

    // Track Booking
    "track.title": "Traccia la tua prenotazione",
    "track.enterRef":
      "Inserisci il riferimento della prenotazione per verificare lo stato del tuo transfer.",
    "track.reference": "Riferimento prenotazione",
    "track.placeholder": "es. GB-240101-0001",
    "track.search": "Traccia",
    "track.notFound": "Prenotazione non trovata. Verifica il riferimento e riprova.",
    "track.bookingDetails": "Dettagli della prenotazione",
    "track.tripInfo": "Informazioni sul viaggio",
    "track.guestInfo": "Informazioni sull'ospite",
    "track.flightDetails": "Dettagli del volo",
    "track.payment": "Pagamento",
    "track.service": "Servizio",
    "track.date": "Data",
    "track.pickupTime": "Orario di ritiro",
    "track.passengers": "Passeggeri",
    "track.from": "Da",
    "track.to": "A",
    "track.hotel": "Hotel",
    "track.vehicle": "Veicolo",
    "track.name": "Nome",
    "track.email": "E-mail",
    "track.phone": "Telefono",
    "track.country": "Paese",
    "track.flight": "Volo",
    "track.airline": "Compagnia aerea",
    "track.terminal": "Terminal",
    "track.method": "Metodo di pagamento",
    "track.status": "Stato",
    "track.total": "Totale",
    "track.notes": "Note",
    "track.payOnArrival": "Pagamento all'arrivo",
    "track.onlinePayment": "Pagamento online",
    "track.cancelBooking": "Annulla prenotazione",
    "track.bookingConfirmed": "La tua prenotazione è stata confermata e verrà assegnato un autista. I dettagli dell'autista saranno condivisi via e-mail prima dell'orario di ritiro.",
    "track.bookingCancelled": "Questa prenotazione è stata annullata.",
    "track.enterRefAbove": "Inserisci il riferimento della prenotazione qui sopra per visualizzare i dettagli.",
    "track.statusPending": "In attesa",
    "track.statusConfirmed": "Confermata",
    "track.statusAssigned": "Autista assegnato",
    "track.statusCompleted": "Completata",
    "track.statusCancelled": "Annullata",
    "track.statusConverted": "Convertita in incarico",

    // Footer
    "footer.quickLinks": "Link rapidi",
    "footer.contactUs": "Contattaci",
    "footer.stayConnected": "Resta connesso",
    "footer.followUs":
      "Seguici sui social media per aggiornamenti, consigli di viaggio e offerte speciali.",
    "footer.rights": "Tutti i diritti riservati.",
    "footer.about":
      "Servizi professionali di transfer aeroportuale e trasporto in tutto l'Egitto.",

    // Common
    "common.loading": "Caricamento...",
    "common.error": "Qualcosa è andato storto",
    "common.bookAnother": "Prenota un altro transfer",
    "common.step": "Passo",
  },

  /* ============================  DUTCH  ============================== */
  nl: {
    // Navigation
    "nav.home": "Home",
    "nav.bookNow": "Nu boeken",
    "nav.trackBooking": "Boeking volgen",
    "nav.menu": "Menu",

    // Booking Widget
    "booking.arrivalTransfer": "Aankomsttransfer",
    "booking.departureTransfer": "Vertrektransfer",
    "booking.arrivalAirport": "Aankomstluchthaven",
    "booking.departureAirport": "Vertrekluchthaven",
    "booking.selectAirport": "Luchthaven selecteren",
    "booking.date": "Datum",
    "booking.time": "Tijd",
    "booking.passengers": "Passagiers",
    "booking.luggage": "Bagage",
    "booking.pickupAirport": "Ophalen (luchthavengebied)",
    "booking.pickupHotel": "Ophalen (hotel / adres)",
    "booking.dropoffHotel": "Afzetten (hotel / adres)",
    "booking.dropoffAirport": "Afzetten (luchthavengebied)",
    "booking.searchLocation": "Locatie zoeken...",
    "booking.babySeat": "Babyzitje",
    "booking.boosterSeat": "Kinderzitverhoger",
    "booking.wheelchair": "Rolstoel",
    "booking.getQuote": "Direct offerte ontvangen",
    "booking.gettingQuote": "Offerte wordt opgehaald...",
    "booking.yourPrice": "Uw prijs",
    "booking.bookNow": "Nu boeken",

    // Landing Page
    "landing.howItWorks": "Hoe het werkt",
    "landing.threeSteps":
      "Boek uw transfer in drie eenvoudige stappen",
    "landing.step1Title": "Zoeken",
    "landing.step1Desc":
      "Voer uw reisgegevens in — ophaaladres, bestemming, datum en aantal passagiers — en ontvang direct een prijsopgave.",
    "landing.step2Title": "Boeken en betalen",
    "landing.step2Desc":
      "Vul uw gegevens in, kies eventueel extra's en betaal veilig online of bij aankomst.",
    "landing.step3Title": "Reizen",
    "landing.step3Desc":
      "Ontvang uw bevestiging, ontmoet uw chauffeur op de luchthaven en geniet van een comfortabele transfer.",
    "landing.happyTravelers": "Tevreden reizigers",
    "landing.onTimeRate": "Stiptheidspercentage",
    "landing.customerSupport": "Klantenservice",
    "landing.averageRating": "Gemiddelde beoordeling",
    "landing.guestsSay": "Wat onze gasten zeggen",
    "landing.theDifference": "Het verschil",
    "landing.noHiddenFees":
      "Geen verborgen kosten — transparante prijzen",
    "landing.freeCancellation":
      "Gratis annulering tot 24 uur van tevoren",
    "landing.flightTracking":
      "Realtime vluchten volgen bij aankomst",
    "landing.proDrivers":
      "Professionele, Engelssprekende chauffeurs",
    "landing.modernVehicles":
      "Moderne voertuigen met airconditioning",
    "landing.doorToDoor":
      "Deur-tot-deurservice door heel Egypte",
    "landing.readyToBook": "Klaar om uw transfer te boeken?",
    "landing.instantQuote":
      "Ontvang direct een offerte en boek in minder dan 2 minuten",

    // Track Booking
    "track.title": "Uw boeking volgen",
    "track.enterRef":
      "Voer uw boekingsreferentie in om de status van uw transfer te controleren.",
    "track.reference": "Boekingsreferentie",
    "track.placeholder": "bijv. GB-240101-0001",
    "track.search": "Volgen",
    "track.notFound": "Boeking niet gevonden. Controleer de referentie en probeer het opnieuw.",
    "track.bookingDetails": "Boekingsgegevens",
    "track.tripInfo": "Reisinformatie",
    "track.guestInfo": "Gastgegevens",
    "track.flightDetails": "Vluchtgegevens",
    "track.payment": "Betaling",
    "track.service": "Service",
    "track.date": "Datum",
    "track.pickupTime": "Ophaaltijd",
    "track.passengers": "Passagiers",
    "track.from": "Van",
    "track.to": "Naar",
    "track.hotel": "Hotel",
    "track.vehicle": "Voertuig",
    "track.name": "Naam",
    "track.email": "E-mail",
    "track.phone": "Telefoon",
    "track.country": "Land",
    "track.flight": "Vlucht",
    "track.airline": "Luchtvaartmaatschappij",
    "track.terminal": "Terminal",
    "track.method": "Betaalmethode",
    "track.status": "Status",
    "track.total": "Totaal",
    "track.notes": "Opmerkingen",
    "track.payOnArrival": "Betaling bij aankomst",
    "track.onlinePayment": "Online betaling",
    "track.cancelBooking": "Boeking annuleren",
    "track.bookingConfirmed": "Uw boeking is bevestigd en er wordt een chauffeur toegewezen. De chauffeurgegevens worden vóór de ophaaltijd per e-mail gedeeld.",
    "track.bookingCancelled": "Deze boeking is geannuleerd.",
    "track.enterRefAbove": "Voer hierboven uw boekingsreferentie in om uw boekingsgegevens te bekijken.",
    "track.statusPending": "In afwachting",
    "track.statusConfirmed": "Bevestigd",
    "track.statusAssigned": "Chauffeur toegewezen",
    "track.statusCompleted": "Voltooid",
    "track.statusCancelled": "Geannuleerd",
    "track.statusConverted": "Omgezet naar opdracht",

    // Footer
    "footer.quickLinks": "Snelkoppelingen",
    "footer.contactUs": "Contact",
    "footer.stayConnected": "Blijf verbonden",
    "footer.followUs":
      "Volg ons op sociale media voor updates, reistips en speciale aanbiedingen.",
    "footer.rights": "Alle rechten voorbehouden.",
    "footer.about":
      "Professionele luchthaven­transfer- en vervoersdiensten door heel Egypte.",

    // Common
    "common.loading": "Laden...",
    "common.error": "Er is iets misgegaan",
    "common.bookAnother": "Nog een transfer boeken",
    "common.step": "Stap",
  },

  /* ============================  RUSSIAN  ============================ */
  ru: {
    // Navigation
    "nav.home": "Главная",
    "nav.bookNow": "Забронировать",
    "nav.trackBooking": "Отследить бронирование",
    "nav.menu": "Меню",

    // Booking Widget
    "booking.arrivalTransfer": "Трансфер по прибытии",
    "booking.departureTransfer": "Трансфер при отъезде",
    "booking.arrivalAirport": "Аэропорт прибытия",
    "booking.departureAirport": "Аэропорт вылета",
    "booking.selectAirport": "Выберите аэропорт",
    "booking.date": "Дата",
    "booking.time": "Время",
    "booking.passengers": "Пассажиры",
    "booking.luggage": "Багаж",
    "booking.pickupAirport": "Посадка (зона аэропорта)",
    "booking.pickupHotel": "Посадка (отель / адрес)",
    "booking.dropoffHotel": "Высадка (отель / адрес)",
    "booking.dropoffAirport": "Высадка (зона аэропорта)",
    "booking.searchLocation": "Поиск места...",
    "booking.babySeat": "Детское автокресло",
    "booking.boosterSeat": "Бустер для ребёнка",
    "booking.wheelchair": "Инвалидная коляска",
    "booking.getQuote": "Получить мгновенную цену",
    "booking.gettingQuote": "Расчёт стоимости...",
    "booking.yourPrice": "Ваша цена",
    "booking.bookNow": "Забронировать",

    // Landing Page
    "landing.howItWorks": "Как это работает",
    "landing.threeSteps":
      "Закажите трансфер в три простых шага",
    "landing.step1Title": "Поиск",
    "landing.step1Desc":
      "Введите данные поездки — место посадки, высадки, дату и количество пассажиров — и мгновенно получите стоимость.",
    "landing.step2Title": "Бронирование и оплата",
    "landing.step2Desc":
      "Заполните данные, выберите дополнительные услуги при необходимости и оплатите онлайн или по прибытии.",
    "landing.step3Title": "Поездка",
    "landing.step3Desc":
      "Получите подтверждение, встретьте водителя в аэропорту и наслаждайтесь комфортным трансфером.",
    "landing.happyTravelers": "Довольных путешественников",
    "landing.onTimeRate": "Пунктуальность",
    "landing.customerSupport": "Служба поддержки",
    "landing.averageRating": "Средняя оценка",
    "landing.guestsSay": "Отзывы наших гостей",
    "landing.theDifference": "Наши преимущества",
    "landing.noHiddenFees":
      "Никаких скрытых платежей — прозрачные цены",
    "landing.freeCancellation":
      "Бесплатная отмена за 24 часа до поездки",
    "landing.flightTracking":
      "Отслеживание рейсов в реальном времени",
    "landing.proDrivers":
      "Профессиональные англоговорящие водители",
    "landing.modernVehicles":
      "Современные автомобили с кондиционером",
    "landing.doorToDoor":
      "Обслуживание от двери до двери по всему Египту",
    "landing.readyToBook": "Готовы заказать трансфер?",
    "landing.instantQuote":
      "Получите мгновенную цену и забронируйте менее чем за 2 минуты",

    // Track Booking
    "track.title": "Отследить бронирование",
    "track.enterRef":
      "Введите номер бронирования, чтобы проверить статус вашего трансфера.",
    "track.reference": "Номер бронирования",
    "track.placeholder": "напр. GB-240101-0001",
    "track.search": "Отследить",
    "track.notFound": "Бронирование не найдено. Пожалуйста, проверьте номер и попробуйте снова.",
    "track.bookingDetails": "Детали бронирования",
    "track.tripInfo": "Информация о поездке",
    "track.guestInfo": "Информация о госте",
    "track.flightDetails": "Данные рейса",
    "track.payment": "Оплата",
    "track.service": "Услуга",
    "track.date": "Дата",
    "track.pickupTime": "Время подачи",
    "track.passengers": "Пассажиры",
    "track.from": "Откуда",
    "track.to": "Куда",
    "track.hotel": "Отель",
    "track.vehicle": "Транспорт",
    "track.name": "Имя",
    "track.email": "Эл. почта",
    "track.phone": "Телефон",
    "track.country": "Страна",
    "track.flight": "Рейс",
    "track.airline": "Авиакомпания",
    "track.terminal": "Терминал",
    "track.method": "Способ оплаты",
    "track.status": "Статус",
    "track.total": "Итого",
    "track.notes": "Примечания",
    "track.payOnArrival": "Оплата по прибытии",
    "track.onlinePayment": "Онлайн-оплата",
    "track.cancelBooking": "Отменить бронирование",
    "track.bookingConfirmed": "Ваше бронирование подтверждено, водитель будет назначен. Данные водителя будут отправлены на вашу электронную почту до времени подачи.",
    "track.bookingCancelled": "Это бронирование было отменено.",
    "track.enterRefAbove": "Введите номер бронирования выше, чтобы просмотреть детали вашего заказа.",
    "track.statusPending": "Ожидание",
    "track.statusConfirmed": "Подтверждено",
    "track.statusAssigned": "Водитель назначен",
    "track.statusCompleted": "Завершено",
    "track.statusCancelled": "Отменено",
    "track.statusConverted": "Преобразовано в задание",

    // Footer
    "footer.quickLinks": "Быстрые ссылки",
    "footer.contactUs": "Связаться с нами",
    "footer.stayConnected": "Оставайтесь на связи",
    "footer.followUs":
      "Подписывайтесь на нас в социальных сетях, чтобы получать новости, советы путешественникам и специальные предложения.",
    "footer.rights": "Все права защищены.",
    "footer.about":
      "Профессиональные трансферные и транспортные услуги по всему Египту.",

    // Common
    "common.loading": "Загрузка...",
    "common.error": "Что-то пошло не так",
    "common.bookAnother": "Заказать ещё один трансфер",
    "common.step": "Шаг",
  },
};

/* ------------------------------------------------------------------ */
/*  useWT hook                                                         */
/* ------------------------------------------------------------------ */

export function useWT(): (key: string) => string {
  const locale = useLocaleStore((s) => s.locale);

  return useCallback(
    (key: string): string => {
      const dict = translations[locale];
      if (dict && key in dict) return dict[key];

      // Fallback to English
      const en = translations.en;
      if (en && key in en) return en[key];

      // Fallback to key itself
      return key;
    },
    [locale]
  );
}
