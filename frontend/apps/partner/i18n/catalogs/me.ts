import type { Catalog, Locale } from "@vsolve/ui";

/** `/me/*` — profile, rate card, crew, language, account, specialist-work (capability). */

const en: Catalog = {
  "me.language.backToAccount": "Back to Account",
  "me.language.confirm": "Confirm language",

  /* -- me-home.tsx ---------------------------------------------------------- */
  "me.home.srTitle": "Partner Account & Settings",
  "me.home.sectionAccountProfile": "Account & Profile",
  "me.home.personalProfileTitle": "Personal Profile",
  "me.home.personalProfileSubtitle": "Contact details, craft & KYC documents",
  "me.home.appLanguageTitle": "App Language",
  "me.home.appLanguageSubtitle": "English (India)",
  "me.home.sectionWorkFinancials": "Work & Financials",
  "me.home.moneyTitle": "Money & Earnings",
  "me.home.moneySubtitle": "Daily earnings, passbook & settlements",
  "me.home.crewTitle": "Contractor Crew",
  "me.home.crewSubtitle": "Manage team roster & crew dispatch",
  "me.home.sectionSupportSafety": "Support & Safety",
  "me.home.helplineTitle": "Partner Helpline",
  "me.home.verified": "Verified",
  "me.home.defaultName": "Partner",

  /* -- profile-panel.tsx ----------------------------------------------------- */
  "me.profile.approval.approved.title": "You can take jobs",
  "me.profile.approval.approved.body": "Your account is approved. Go online to start getting offers.",
  "me.profile.approval.submitted.title": "We are checking your details",
  "me.profile.approval.submitted.body": "Nothing to do right now. We will tell you as soon as this is done.",
  "me.profile.approval.underReview.title": "We are checking your details",
  "me.profile.approval.underReview.body": "Nothing to do right now. We will tell you as soon as this is done.",
  "me.profile.approval.changesRequired.title": "We need something from you",
  "me.profile.approval.changesRequired.body":
    "Open your application to see what to fix. You cannot get jobs until this is done.",
  "me.profile.approval.draft.title": "Your application is not finished",
  "me.profile.approval.draft.body": "Finish it to start getting jobs.",
  "me.profile.approval.rejected.title": "This account cannot take jobs",
  "me.profile.approval.rejected.body": "Contact support if you think this is wrong.",
  "me.profile.noProfileTitle": "You do not have a Partner profile yet",
  "me.profile.noProfileMessage": "Finish your application and we will set one up.",
  "me.profile.openApplication": "Open my application",
  "me.profile.loadErrorTitle": "We could not load your profile",
  "me.profile.phoneChangeNote":
    "To change your phone number, contact support — it is how you sign in, so we verify it before moving it.",
  "me.profile.pickupLocationLabel": "Default pickup location",
  "me.profile.whatYouDoLabel": "What you do",
  "me.profile.whereYouWorkLabel": "Where you work",
  "me.profile.withUsSinceLabel": "With us since",
  "me.profile.gettingPaidLabel": "Getting paid",
  "me.profile.locationNotSet": "Not set yet — used to prefill rental ads",
  "me.profile.notSetYet": "Not set yet",
  "me.profile.experienceYears": {
    other: "{count} years of experience",
    one: "{count} year of experience",
  },
  "me.profile.bankReady": "Your bank account is ready",
  "me.profile.bankNotReady": "No bank account yet — we cannot pay you until this is added.",
  "me.profile.manageHeading": "Manage",
  "me.profile.myBookings": "My bookings",
  "me.profile.myApplication": "My application and documents",
  "me.profile.myMoney": "My money",
  "me.profile.addAction": "Add",
  "me.profile.editName.title": "Change your name",
  "me.profile.editName.description": "This is the name Customers see when you arrive.",
  "me.profile.editName.nameLabel": "Your name",
  "me.profile.editLocation.title": "Default pickup location",
  "me.profile.editLocation.description":
    "Used to prefill rental ads. You can still change the location on each ad.",
  "me.profile.editLocation.addressLabel": "Pickup / registered address",
  "me.profile.editLocation.addressPlaceholder": "Area, city",

  /* -- capability feature (features/capability/**) --------------------------- */
  "me.capability.business.refusalNoRegistration":
    "Working as yourself means there is no company registration to record. Choose a business type if you have one.",
  "me.capability.business.refusalGstinNeedsFlag":
    "Tick “I am GST registered” before adding a GSTIN, or clear the GSTIN.",
  "me.capability.ask.maxCrewSize.label": "Most workers you can send at once",
  "me.capability.ask.maxCrewSize.help": "A realistic number. We use it to stop sending you work you cannot staff.",
  "me.capability.ask.maxProjectValue.label": "Largest project you want to quote for",
  "me.capability.ask.maxProjectValue.help": "A ceiling, not a commitment. You will not be shown work far above it.",

  "me.capability.status.requested.label": "Requested",
  "me.capability.status.requested.headline": "We have your request",
  "me.capability.status.requested.detail":
    "It joins the review queue shortly. Nothing more is needed from you right now, and you can keep browsing work in the meantime.",
  "me.capability.status.underReview.label": "Under review",
  "me.capability.status.underReview.headline": "Someone is checking your request",
  "me.capability.status.underReview.detail":
    "Nothing more is needed from you right now. If anything is unclear we will ask you directly rather than refusing it.",
  "me.capability.status.approved.label": "Approved",
  "me.capability.status.approved.headline": "You can take this work",
  "me.capability.status.approved.detail": "Enquiries for this service will start reaching you.",
  "me.capability.status.withdrawn.label": "Closed by you",
  "me.capability.status.withdrawn.headline": "You closed this request",
  "me.capability.status.withdrawn.detail":
    "It is not being reviewed and it does not give you access to this work. Asking again starts a new review — closing it does not count against you.",
  "me.capability.status.withdrawn.secondaryActionLabel": "I did not close this",
  "me.capability.status.unknown.label": "Unknown",
  "me.capability.status.unknown.headline": "We cannot describe this request",
  "me.capability.status.unknown.detail":
    "Your app is older than this part of Vsolve. Update it, or contact support and we will tell you exactly where this stands.",
  "me.capability.status.expired.label": "Expired",
  "me.capability.status.expired.headline": "Your approval for this work has run out",
  "me.capability.status.expired.detail":
    "You will not receive new enquiries for it. Asking again is quick — we keep what you already sent.",
  "me.capability.status.documentExpired.label": "Document expired",
  "me.capability.status.documentExpired.headline": "A document we need has run out of date",
  "me.capability.status.documentExpired.detail":
    "New enquiries for this work stop reaching you until you replace it: {kinds}. Work you have already committed to is unaffected.",
  "me.capability.status.changesNeeded.label": "Changes needed",
  "me.capability.status.changesNeeded.headline": "We need something corrected",
  "me.capability.status.changesNeeded.detailFallback":
    "A reviewer asked for changes but did not say what. Contact support and we will tell you exactly what is needed.",
  "me.capability.status.rejected.label": "Not approved",
  "me.capability.status.rejected.headline": "We could not approve this",
  "me.capability.status.rejected.detailFallback":
    "A reviewer turned this down but did not say why. Contact support and we will tell you.",
  "me.capability.status.rejected.detailSuffix":
    " This does not stop you asking again for the same work once it is sorted.",
  "me.capability.status.suspended.label": "Suspended",
  "me.capability.status.suspended.headline": "This work is paused on your account",
  "me.capability.status.suspended.detail":
    "You will not receive new enquiries for it. Work you have already committed to stays visible. Contact support to discuss this.",
  "me.capability.action.askAgain": "Ask again",
  "me.capability.action.contactSupport": "Contact support",
  "me.capability.action.replaceDocument": "Replace the document",
  "me.capability.action.fixAndResend": "Fix and resend",
  "me.capability.action.askUsWhy": "Ask us why",
  "me.capability.action.waitMessage": "Nothing to do right now. We will message you when this moves.",

  "me.capability.gate.action.finishApplication": "Finish your application",
  "me.capability.gate.action.addBankDetails": "Add your bank details",
  "me.capability.gate.action.addCrew": "Add your crew",
  "me.capability.gate.fallbackReason":
    "We need one more thing before you can do this. Contact support and we will tell you what.",

  "me.capability.insurance.problem.insurerName": "Add the name of your insurer.",
  "me.capability.insurance.problem.policyReference":
    "Add the policy number, exactly as it appears on the document.",
  "me.capability.insurance.problem.coverage": "Add how much the policy covers.",
  "me.capability.insurance.problem.datesMissing": "Add the dates the policy runs between.",
  "me.capability.insurance.problem.datesInvalid":
    "The policy has to end after it starts. Check the two dates.",

  "me.capability.plan.identity.title": "Your name",
  "me.capability.plan.identity.why": "Customers see this before they let you into their home.",
  "me.capability.plan.identity.action": "Add your name",
  "me.capability.plan.services.title": "One service",
  "me.capability.plan.services.why":
    "One thing you do. It is what we match work against — you can add more later.",
  "me.capability.plan.services.action": "Pick a service",
  "me.capability.plan.areas.title": "One city",
  "me.capability.plan.areas.why": "Where you want work. You can add more later.",
  "me.capability.plan.areas.action": "Choose where you work",
  "me.capability.plan.capability.title": "Workforce or project approval",
  "me.capability.plan.capability.whyAsked": "You have asked to be approved. Its progress is below.",
  "me.capability.plan.capability.whyDefault":
    "Supplying a crew or quoting for a whole project is reviewed separately from ordinary jobs. Ask when you want it — browsing does not need it.",
  "me.capability.plan.capability.action": "See what you can apply for",
  "me.capability.plan.businessType.title": "How you work",
  "me.capability.plan.businessType.whyAsked":
    "You have asked to be approved for specialist work. Tell us whether that is you on your own, an agency supplying people, or a vendor taking on whole jobs — it decides how tax and payment work.",
  "me.capability.plan.businessType.whyDefault":
    "Asked for when you apply for workforce or project work. Until then we treat you as working on your own.",
  "me.capability.plan.businessType.action": "Tell us how you work",
  "me.capability.plan.capacity.title": "How much you can take on",
  "me.capability.plan.capacity.whyTemplate":
    "We do not have a limit recorded for {names}. Without one we cannot stop sending you work you are not able to staff.",
  "me.capability.plan.capacity.action": "Set your limit",
  "me.capability.plan.skills.title": "What you can do",
  "me.capability.plan.skills.whyAsked":
    "Skills decide which enquiries you are eligible for. A capability without them is approved for work we will never send you.",
  "me.capability.plan.skills.whyDefault":
    "Asked for when you apply for specialist work. A skill on its own never switches a workspace on.",
  "me.capability.plan.skills.action": "Add your skills",
  "me.capability.plan.experience.title": "How long you have done this",
  "me.capability.plan.experience.why":
    "Customers read this on your profile and it helps when two vendors quote the same price.",
  "me.capability.plan.experience.action": "Add your experience",
  "me.capability.plan.availability.title": "Your hours",
  "me.capability.plan.availability.whyApproved":
    "You are approved for work. We only send enquiries inside the hours you publish, so an empty week means nothing reaches you.",
  "me.capability.plan.availability.whyDefault": "Asked for once something you applied for is approved.",
  "me.capability.plan.availability.action": "Set your hours",
  "me.capability.plan.documentsExpired.title": "A document has expired",
  "me.capability.plan.documentsExpired.whyTemplate":
    "New enquiries stop reaching you until it is replaced: {kinds}. Work you have already committed to is unaffected.",
  "me.capability.plan.documentsExpired.action": "Replace it",
  "me.capability.plan.documents.title": "Your ID and address proof",
  "me.capability.plan.documents.why":
    "Asked for before you accept your first job, so customers know who is coming. Not before you look at work.",
  "me.capability.plan.documents.action": "Add your documents",
  "me.capability.plan.documentExpiry.title": "A document runs out soon",
  "me.capability.plan.documentExpiry.why": {
    other: "One of the documents we need expires in {days} days. Replacing it before then keeps enquiries coming.",
    one: "One of the documents we need expires in {days} day. Replacing it before then keeps enquiries coming.",
  },
  "me.capability.plan.documentExpiry.action": "Replace it early",
  "me.capability.plan.insurance.title": "Worker insurance",
  "me.capability.plan.insurance.whyExpired":
    "The cover you declared has ended. Workforce enquiries stop reaching you until it is renewed.",
  "me.capability.plan.insurance.whyRequired":
    "You are sending people onto someone else's site. We need to know who covers them if they are hurt there before this work can be approved.",
  "me.capability.plan.insurance.whyDefault":
    "Asked for when you apply for work where you send people to a customer's site.",
  "me.capability.plan.insurance.action": "Declare your cover",
  "me.capability.plan.gate.kyc.title": "Identity check",
  "me.capability.plan.gate.payout.title": "Where money goes",
  "me.capability.plan.gate.crew.title": "Who you send",
  "me.capability.plan.done": "Done.",
  "me.capability.plan.loading": "Working out what you still need",
  "me.capability.plan.nowHeading": {
    other: "{count} things to do",
    one: "One thing to do",
  },
  "me.capability.plan.nothingNeededTitle": "Nothing needed from you",
  "me.capability.plan.nothingNeededCompleteBody":
    "Everything we ask for is on file. Enquiries reach you as they arrive.",
  "me.capability.plan.nothingNeededPendingBody":
    "Nothing is waiting on you right now. We will ask for the things below at the moment they matter.",
  "me.capability.plan.laterHeading": "We will ask for these later",
  "me.capability.plan.doneHeading": "Already done ({count})",

  "me.capability.screen.specialistWork.title": "Specialist work",
  "me.capability.screen.specialistWork.description":
    "Supplying a crew by the day, or quoting for a whole project, is reviewed separately from ordinary jobs. Asking costs nothing and does not affect the work you already do.",
  "me.capability.screen.whereRequestsStand": "Where your requests stand",
  "me.capability.screen.askToBeApproved": "Ask to be approved",
  "me.capability.screen.howYouWork.title": "How you work",
  "me.capability.screen.howYouWork.description":
    "This decides who signs, who is liable and who the customer pays. We never work it out from the services you offer.",
  "me.capability.screen.loadingDetails": "Loading your details…",
  "me.capability.screen.loadOptionsErrorTitle": "We could not load the options",
  "me.capability.screen.loadOptionsErrorMessage":
    "Nothing you have entered is lost. Check your connection and try again.",
  "me.capability.business.legalNameLabel": "Registered business name",
  "me.capability.business.legalNameDescription": "As it appears on your registration, if you have one.",
  "me.capability.business.registrationNumberLabel": "Registration number",
  "me.capability.business.gstRegisteredLabel": "I am GST registered",
  "me.capability.business.gstinLabel": "GSTIN",
  "me.capability.business.yearsInOperationLabel": "Years in operation",
  "me.capability.business.expectedNameHint":
    "An agency or vendor is usually asked for a registered business name. You can save without one and add it later.",
  "me.capability.business.saveErrorTitle": "We could not save this",
  "me.capability.business.saved": "Saved.",
  "me.capability.backToSpecialistWork": "Back to specialist work",
  "me.capability.screen.insurance.title": "Worker insurance",
  "me.capability.screen.insurance.description":
    "Required before workforce capabilities are approved. Operations checks it — until then it is a declaration, not cover we have stood behind.",
  "me.capability.screen.loadingDeclaration": "Loading your declaration…",
  "me.capability.screen.loadDeclarationErrorTitle": "We could not load your declaration",
  "me.capability.screen.demand.title": "Work near you",
  "me.capability.screen.demand.description":
    "Live requests from customers in the areas you chose. Names, phone numbers and exact addresses stay hidden until a customer invites you.",
  "me.capability.screen.demand.finishStepsTitle": "Finish the steps above to see work",
  "me.capability.screen.demand.finishStepsBody":
    "We match requests against the service and the city you give us. Until we have both, there is nothing honest to show you here.",

  "me.capability.businessChoice.legend": "How do you work?",
  "me.capability.businessChoice.description":
    "This decides who pays you and how tax is handled. You can change it later.",

  "me.capability.picker.loading": "Loading the work you can apply for",
  "me.capability.picker.emptyTitle": "Nothing to apply for yet",
  "me.capability.picker.emptyDescription":
    "The services you have chosen are not open to workforce or project vendors. Adding another service on “Your work” may open one.",
  "me.capability.picker.alreadyAsked": "Already asked",
  "me.capability.picker.platformPaidNote": "Vsolve holds each stage of the payment until the customer approves it.",
  "me.capability.picker.directPaidNote": "The customer pays you directly.",
  "me.capability.picker.insuranceNote": "You will be asked for worker insurance before this is approved.",
  "me.capability.picker.alreadyRequestedNote":
    "You have a live request for this. Its progress is on your capabilities list.",
  "me.capability.picker.unsupportedPrefix": "This service asks something your app cannot show yet",
  "me.capability.picker.unsupportedSuffix": "Update the app, or ask support to record the answer for you.",
  "me.capability.picker.sendingRequest": "Sending your request",
  "me.capability.picker.submitButton": "Ask to be approved",
  "me.capability.picker.reviewNote":
    "We review this before it switches on. Choosing a skill on its own does not open this work.",
  "me.capability.picker.chooseOne": "Choose one",

  "me.capability.statusList.loading": "Loading what you are approved for",
  "me.capability.statusList.emptyTitle": "You have not asked for any specialist work yet",
  "me.capability.statusList.emptyDescription":
    "Workforce and project work need approval before they switch on. Everything else on your account works as it does today.",
  "me.capability.statusList.decidedLabel": "Decided",
  "me.capability.statusList.referenceSuffix": " · reference {code}",

  "me.capability.demand.loading": "Loading work near you",
  "me.capability.demand.ineligibleNotice":
    "This is real work being asked for near you. You need approval for these services before you can respond — each card says which.",
  "me.capability.demand.privacyNote":
    "Names, phone numbers and exact addresses stay hidden until a customer invites you.",
  "me.capability.demand.emptyNoMatchTitle": "Nothing matched your services yet",
  "me.capability.demand.emptyNoMatchDescription":
    "You have told us one thing you do and one place you work. Adding another of either widens what reaches you.",
  "me.capability.demand.emptyNoneNearbyTitle": "Nothing in your area right now",
  "me.capability.demand.emptyNoneNearbyDescription":
    "Work arrives through the day. We will message you when something matches what you do.",
  "me.capability.demand.noStartDate": "No start date given yet",
  "me.capability.demand.startsLabel": "Starts",
  "me.capability.demand.eligibleNote": "You can be invited to this.",
  "me.capability.demand.ineligibleFallbackHint": "You are not approved for this kind of work yet.",

  "me.capability.express.title": "Start taking work",
  "me.capability.express.readyBody": "You are set up. Here is what people near you are asking for.",
  "me.capability.express.stepsRemainingTemplate": "Four short steps. {remaining} to go.",
  "me.capability.express.ariaStepsProgress": "Setup steps, {done} of {total} done",
  "me.capability.express.srDone": "Done",
  "me.capability.express.srNotDone": "Not done yet",
  "me.capability.express.seeWhatPeopleNeed": "See what people need",
  "me.capability.express.documentsLaterNote":
    "We ask for documents later, when you accept your first job — not now.",
  "me.capability.express.step.phone.label": "Your number",
  "me.capability.express.step.phone.ask": "We text you a code. No password to remember.",
  "me.capability.express.step.identity.label": "Your name",
  "me.capability.express.step.identity.ask":
    "What customers will see, and whether you work alone or run a team.",
  "me.capability.express.step.service.label": "One service",
  "me.capability.express.step.service.ask": "Pick one thing you do. You can add more later.",
  "me.capability.express.step.area.label": "One city",
  "me.capability.express.step.area.ask": "Where you want work. You can add more later.",

  "me.capability.gateNotice.heading": "One thing before you can {action}",

  "me.capability.insuranceForm.intro":
    "You are sending people onto someone else's site. This is who covers them if something goes wrong there.",
  "me.capability.insuranceForm.insurerLabel": "Insurer",
  "me.capability.insuranceForm.policyNumberLabel": "Policy number",
  "me.capability.insuranceForm.policyNumberDescription": "Exactly as it appears on the document.",
  "me.capability.insuranceForm.amountCoveredLabel": "Amount covered (₹)",
  "me.capability.insuranceForm.coverStartsLabel": "Cover starts",
  "me.capability.insuranceForm.coverEndsLabel": "Cover ends",
  "me.capability.insuranceForm.wcLabel": "This policy includes workmen's compensation.",
  "me.capability.insuranceForm.wcHelp": "Some construction and industrial work cannot be approved without it.",
  "me.capability.insuranceForm.updateButton": "Update declaration",
  "me.capability.insuranceForm.saveButton": "Save declaration",
  "me.capability.insuranceForm.footerNote":
    "We check this before approving workforce capabilities. Saying you are covered when you are not is grounds for suspension.",
  "me.capability.insuranceForm.checkedBadge": "Checked",
  "me.capability.insuranceForm.notCheckedBadge": "Not checked yet",
  "me.capability.insuranceForm.expiredBadge": "Expired",
  "me.capability.insuranceForm.endingSoonBadge": "Ending soon",
  "me.capability.insuranceForm.coverLabel": "Cover",
  "me.capability.insuranceForm.coverCaption": "{insurer} · ends {validTo}",
  "me.capability.insuranceForm.expiredNote":
    "This cover has ended. Workforce enquiries stop reaching you until it is renewed.",
  "me.capability.insuranceForm.endingSoonTemplate": {
    other: "Ends in {days} days. Renew it before then so your work is not interrupted.",
    one: "Ends in {days} day. Renew it before then so your work is not interrupted.",
  },
};

const te: Catalog = {
  "me.language.backToAccount": "ఖాతాకు తిరిగి వెళ్ళండి",
  "me.language.confirm": "భాషను నిర్ధారించండి",

  "me.home.srTitle": "పార్ట్‌నర్ ఖాతా & సెట్టింగ్‌లు",
  "me.home.sectionAccountProfile": "ఖాతా & ప్రొఫైల్",
  "me.home.personalProfileTitle": "పర్సనల్ ప్రొఫైల్",
  "me.home.personalProfileSubtitle": "కాంటాక్ట్ వివరాలు, క్రాఫ్ట్ & KYC పత్రాలు",
  "me.home.appLanguageTitle": "యాప్ భాష",
  "me.home.appLanguageSubtitle": "ఇంగ్లీష్ (భారత్)",
  "me.home.sectionWorkFinancials": "పని & ఆర్థికాలు",
  "me.home.moneyTitle": "డబ్బు & ఆర్జన",
  "me.home.moneySubtitle": "రోజువారీ ఆర్జన, పాస్‌బుక్ & సెటిల్‌మెంట్‌లు",
  "me.home.crewTitle": "కాంట్రాక్టర్ సిబ్బంది",
  "me.home.crewSubtitle": "టీమ్ రోస్టర్ & సిబ్బంది డిస్పాచ్‌ని నిర్వహించండి",
  "me.home.sectionSupportSafety": "సహాయం & భద్రత",
  "me.home.helplineTitle": "పార్ట్‌నర్ హెల్ప్‌లైన్",
  "me.home.verified": "నిర్ధారించబడింది",
  "me.home.defaultName": "పార్ట్‌నర్",

  "me.profile.approval.approved.title": "మీరు పనులు తీసుకోవచ్చు",
  "me.profile.approval.approved.body": "మీ ఖాతా ఆమోదించబడింది. ఆఫర్‌లు పొందడం మొదలుపెట్టడానికి ఆన్‌లైన్‌కు వెళ్ళండి.",
  "me.profile.approval.submitted.title": "మేము మీ వివరాలను చూస్తున్నాం",
  "me.profile.approval.submitted.body": "ఇప్పుడు ఏమీ చేయాల్సిన అవసరం లేదు. ఇది పూర్తయిన వెంటనే మేము మీకు చెప్తాం.",
  "me.profile.approval.underReview.title": "మేము మీ వివరాలను చూస్తున్నాం",
  "me.profile.approval.underReview.body": "ఇప్పుడు ఏమీ చేయాల్సిన అవసరం లేదు. ఇది పూర్తయిన వెంటనే మేము మీకు చెప్తాం.",
  "me.profile.approval.changesRequired.title": "మేము మీ నుండి కొంత సమాచారం కోరుకుంటున్నాం",
  "me.profile.approval.changesRequired.body":
    "ఏం సరిదిద్దాలో చూడటానికి మీ అప్లికేషన్ తెరవండి. ఇది పూర్తయ్యే వరకు మీకు పనులు వచ్చవు.",
  "me.profile.approval.draft.title": "మీ అప్లికేషన్ పూర్తవ్వలేదు",
  "me.profile.approval.draft.body": "పనులు పొందడం మొదలుపెట్టడానికి దాన్ని పూర్తి చేయండి.",
  "me.profile.approval.rejected.title": "ఈ ఖాతా పనులు తీసుకోలేదు",
  "me.profile.approval.rejected.body": "ఇది తప్పు అని మీరు భావిస్తే సపోర్ట్‌ని సంప్రదించండి.",
  "me.profile.noProfileTitle": "మీకు ఇంకా పార్ట్‌నర్ ప్రొఫైల్ లేదు",
  "me.profile.noProfileMessage": "మీ అప్లికేషన్ పూర్తి చేయండి, మేము ఒకదాన్ని సెటప్ చేస్తాం.",
  "me.profile.openApplication": "నా అప్లికేషన్ తెరవండి",
  "me.profile.loadErrorTitle": "మేము మీ ప్రొఫైల్‌ని లోడ్ చేయలేకపోయాం",
  "me.profile.phoneChangeNote":
    "మీ ఫోన్ నంబర్ మార్చడానికి, సపోర్ట్‌ని సంప్రదించండి — మీరు దీనితోనే సైన్ ఇన్ అవుతారు, కాబట్టి దాన్ని మార్చే ముందు మేము దాన్ని వెరిఫై చేస్తాం.",
  "me.profile.pickupLocationLabel": "డిఫాల్ట్ పికప్ లొకేషన్",
  "me.profile.whatYouDoLabel": "మీరు ఏం చేస్తారు",
  "me.profile.whereYouWorkLabel": "మీరు ఎక్కడ పనిచేస్తారు",
  "me.profile.withUsSinceLabel": "మాతో ఎప్పటి నుండి ఉన్నారు",
  "me.profile.gettingPaidLabel": "చెల్లింపు పొందడం",
  "me.profile.locationNotSet": "ఇంకా సెట్ చేయలేదు — రెంటల్ ప్రకటనలను ముందే నింపడానికి వాడతారు",
  "me.profile.notSetYet": "ఇంకా సెట్ చేయలేదు",
  "me.profile.experienceYears": {
    other: "{count} సంవత్సరాల అనుభవం",
    one: "{count} సంవత్సరం అనుభవం",
  },
  "me.profile.bankReady": "మీ బ్యాంక్ ఖాతా సిద్ధంగా ఉంది",
  "me.profile.bankNotReady": "ఇంకా బ్యాంక్ ఖాతా లేదు — ఇది జోడించే వరకు మేము మీకు చెల్లించలేం.",
  "me.profile.manageHeading": "నిర్వహించండి",
  "me.profile.myBookings": "నా బుకింగ్‌లు",
  "me.profile.myApplication": "నా అప్లికేషన్ & పత్రాలు",
  "me.profile.myMoney": "నా డబ్బు",
  "me.profile.addAction": "జోడించండి",
  "me.profile.editName.title": "మీ పేరును మార్చండి",
  "me.profile.editName.description": "మీరు వచ్చినప్పుడు కస్టమర్లు చూసే పేరు ఇదే.",
  "me.profile.editName.nameLabel": "మీ పేరు",
  "me.profile.editLocation.title": "డిఫాల్ట్ పికప్ లొకేషన్",
  "me.profile.editLocation.description":
    "రెంటల్ ప్రకటనలను ముందే నింపడానికి వాడతారు. ప్రతి ప్రకటనలో మీరు లొకేషన్‌ని మార్చవచ్చు.",
  "me.profile.editLocation.addressLabel": "పికప్ / నమోదైన అడ్రస్",
  "me.profile.editLocation.addressPlaceholder": "ఏరియా, నగరం",

  "me.capability.business.refusalNoRegistration":
    "మీరే పనిచేస్తున్నారంటే నమోదు చేయడానికి కంపెనీ రిజిస్ట్రేషన్ ఏదీ ఉండదు. మీ వద్ద ఒకటి ఉంటే బిజినెస్ టైప్‌ని ఎంచుకోండి.",
  "me.capability.business.refusalGstinNeedsFlag":
    "GSTIN జోడించే ముందు “నేను GST రిజిస్టర్ అయ్యాను” అని టిక్ చేయండి, లేదా GSTIN తీసివేయండి.",
  "me.capability.ask.maxCrewSize.label": "ఒకేసారి మీరు పంపగలిగే గరిష్ట వర్కర్లు",
  "me.capability.ask.maxCrewSize.help":
    "వాస్తవిక సంఖ్య. మీరు సిబ్బందిని పెట్టలేని పనిని మీకు పంపకుండా ఆపడానికి దీన్ని వాడతాం.",
  "me.capability.ask.maxProjectValue.label": "మీరు కోట్ చేయాలనుకునే అతిపెద్ద ప్రాజెక్ట్",
  "me.capability.ask.maxProjectValue.help":
    "ఇది ఒక పరిమితి, ఒక హామీ కాదు. దీనికి చాలా ఎక్కువైన పనిని మీకు చూపించం.",

  "me.capability.status.requested.label": "అభ్యర్థించారు",
  "me.capability.status.requested.headline": "మీ అభ్యర్థన మా వద్ద ఉంది",
  "me.capability.status.requested.detail":
    "ఇది త్వరలో రివ్యూ క్యూలో చేరుతుంది. ఇప్పుడు మీ నుండి ఏమీ అవసరం లేదు, ఈ మధ్యలో మీరు పనిని చూస్తూ ఉండవచ్చు.",
  "me.capability.status.underReview.label": "రివ్యూలో ఉంది",
  "me.capability.status.underReview.headline": "ఎవరో మీ అభ్యర్థనను చూస్తున్నారు",
  "me.capability.status.underReview.detail":
    "ఇప్పుడు మీ నుండి ఏమీ అవసరం లేదు. ఏదైనా అస్పష్టంగా ఉంటే తిరస్కరించడం కాకుండా మేము నేరుగా మిమ్మల్ని అడుగుతాం.",
  "me.capability.status.approved.label": "ఆమోదించబడింది",
  "me.capability.status.approved.headline": "మీరు ఈ పనిని తీసుకోవచ్చు",
  "me.capability.status.approved.detail": "ఈ సేవ కోసం ఎంక్వైరీలు మీకు రావడం మొదలవుతుంది.",
  "me.capability.status.withdrawn.label": "మీరు మూసివేశారు",
  "me.capability.status.withdrawn.headline": "మీరు ఈ అభ్యర్థనను మూసివేశారు",
  "me.capability.status.withdrawn.detail":
    "ఇది రివ్యూ చేయబడటం లేదు మరియు ఇది మీకు ఈ పనికి యాక్సెస్ ఇవ్వదు. మళ్ళీ అడగడం కొత్త రివ్యూని మొదలుపెడుతుంది — దీన్ని మూసివేయడం మీకు వ్యతిరేకంగా లెక్కించదు.",
  "me.capability.status.withdrawn.secondaryActionLabel": "నేను దీన్ని మూసివేయలేదు",
  "me.capability.status.unknown.label": "తెలియదు",
  "me.capability.status.unknown.headline": "ఈ అభ్యర్థనను మేము వివరించలేం",
  "me.capability.status.unknown.detail":
    "మీ యాప్ Vsolve లోని ఈ భాగం కంటే పాతది. దాన్ని అప్‌డేట్ చేయండి, లేదా సపోర్ట్‌ని సంప్రదించండి, ఇది ఎక్కడ ఉందో మేము ఖచ్చితంగా చెప్తాం.",
  "me.capability.status.expired.label": "గడువు ముగిసింది",
  "me.capability.status.expired.headline": "ఈ పని కోసం మీ ఆమోదం గడువు ముగిసింది",
  "me.capability.status.expired.detail":
    "దీని కోసం మీకు కొత్త ఎంక్వైరీలు రావు. మళ్ళీ అడగడం వేగంగా జరుగుతుంది — మీరు ఇప్పటికే పంపినది మేము ఉంచుకుంటాం.",
  "me.capability.status.documentExpired.label": "పత్రం గడువు ముగిసింది",
  "me.capability.status.documentExpired.headline": "మాకు కావాల్సిన ఒక పత్రం గడువు ముగిసింది",
  "me.capability.status.documentExpired.detail":
    "మీరు దాన్ని మార్చే వరకు ఈ పని కోసం కొత్త ఎంక్వైరీలు రావు: {kinds}. మీరు ఇప్పటికే చేపట్టిన పనిపై ప్రభావం ఉండదు.",
  "me.capability.status.changesNeeded.label": "మార్పులు అవసరం",
  "me.capability.status.changesNeeded.headline": "మాకు ఏదో సరిదిద్దాలి",
  "me.capability.status.changesNeeded.detailFallback":
    "ఒక రివ్యూయర్ మార్పులు కోరారు కానీ ఏమిటో చెప్పలేదు. సపోర్ట్‌ని సంప్రదించండి, ఏం అవసరమో మేము ఖచ్చితంగా చెప్తాం.",
  "me.capability.status.rejected.label": "ఆమోదించబడలేదు",
  "me.capability.status.rejected.headline": "దీన్ని మేము ఆమోదించలేకపోయాం",
  "me.capability.status.rejected.detailFallback":
    "ఒక రివ్యూయర్ దీన్ని తిరస్కరించారు కానీ ఎందుకో చెప్పలేదు. సపోర్ట్‌ని సంప్రదించండి, మేము మీకు చెప్తాం.",
  "me.capability.status.rejected.detailSuffix":
    " ఇది సరిదిద్దబడిన తర్వాత అదే పని కోసం మళ్ళీ అడగడాన్ని ఆపదు.",
  "me.capability.status.suspended.label": "సస్పెండ్ చేయబడింది",
  "me.capability.status.suspended.headline": "ఈ పని మీ ఖాతాలో పాజ్ చేయబడింది",
  "me.capability.status.suspended.detail":
    "దీని కోసం మీకు కొత్త ఎంక్వైరీలు రావు. మీరు ఇప్పటికే చేపట్టిన పని కనిపిస్తూనే ఉంటుంది. దీని గురించి చర్చించడానికి సపోర్ట్‌ని సంప్రదించండి.",
  "me.capability.action.askAgain": "మళ్ళీ అడగండి",
  "me.capability.action.contactSupport": "సపోర్ట్‌ని సంప్రదించండి",
  "me.capability.action.replaceDocument": "పత్రాన్ని మార్చండి",
  "me.capability.action.fixAndResend": "సరిదిద్ది మళ్ళీ పంపండి",
  "me.capability.action.askUsWhy": "ఎందుకో మమ్మల్ని అడగండి",
  "me.capability.action.waitMessage": "ఇప్పుడు ఏమీ చేయాల్సిన అవసరం లేదు. ఇది మారినప్పుడు మేము మీకు మెసేజ్ చేస్తాం.",

  "me.capability.gate.action.finishApplication": "మీ అప్లికేషన్ పూర్తి చేయండి",
  "me.capability.gate.action.addBankDetails": "మీ బ్యాంక్ వివరాలను జోడించండి",
  "me.capability.gate.action.addCrew": "మీ సిబ్బందిని జోడించండి",
  "me.capability.gate.fallbackReason":
    "మీరు దీన్ని చేసే ముందు మాకు ఒక విషయం అవసరం. సపోర్ట్‌ని సంప్రదించండి, అది ఏమిటో మేము చెప్తాం.",

  "me.capability.insurance.problem.insurerName": "మీ ఇన్సూరర్ పేరును జోడించండి.",
  "me.capability.insurance.problem.policyReference":
    "పత్రంలో ఉన్నట్టే పాలసీ నంబర్‌ని ఖచ్చితంగా జోడించండి.",
  "me.capability.insurance.problem.coverage": "పాలసీ ఎంత కవర్ చేస్తుందో జోడించండి.",
  "me.capability.insurance.problem.datesMissing": "పాలసీ నడిచే తేదీలను జోడించండి.",
  "me.capability.insurance.problem.datesInvalid":
    "పాలసీ మొదలైన తర్వాతే ముగియాలి. రెండు తేదీలను చెక్ చేయండి.",

  "me.capability.plan.identity.title": "మీ పేరు",
  "me.capability.plan.identity.why": "మిమ్మల్ని వారి ఇంట్లోకి అనుమతించే ముందు కస్టమర్లు దీన్ని చూస్తారు.",
  "me.capability.plan.identity.action": "మీ పేరును జోడించండి",
  "me.capability.plan.services.title": "ఒక సేవ",
  "me.capability.plan.services.why":
    "మీరు చేసే ఒక పని. మేము దీనికి వ్యతిరేకంగా పనిని సరిపోల్చుతాం — తర్వాత మరిన్ని జోడించవచ్చు.",
  "me.capability.plan.services.action": "ఒక సేవను ఎంచుకోండి",
  "me.capability.plan.areas.title": "ఒక నగరం",
  "me.capability.plan.areas.why": "మీకు పని కావాల్సిన ప్రాంతం. తర్వాత మరిన్ని జోడించవచ్చు.",
  "me.capability.plan.areas.action": "మీరు పనిచేసే ప్రాంతాన్ని ఎంచుకోండి",
  "me.capability.plan.capability.title": "వర్క్‌ఫోర్స్ లేదా ప్రాజెక్ట్ ఆమోదం",
  "me.capability.plan.capability.whyAsked": "మీరు ఆమోదం కోసం అడిగారు. దాని ప్రగతి దిగువన ఉంది.",
  "me.capability.plan.capability.whyDefault":
    "రోజువారీగా సిబ్బందిని అందించడం లేదా పూర్తి ప్రాజెక్ట్‌కి కోట్ చేయడం సాధారణ పనుల కంటే వేరుగా రివ్యూ చేయబడుతుంది. మీకు కావాలనుకున్నప్పుడు అడగండి — బ్రౌజ్ చేయడానికి ఇది అవసరం లేదు.",
  "me.capability.plan.capability.action": "మీరు ఏ దాని కోసం అప్లై చేయవచ్చో చూడండి",
  "me.capability.plan.businessType.title": "మీరు ఎలా పనిచేస్తారు",
  "me.capability.plan.businessType.whyAsked":
    "మీరు స్పెషలిస్ట్ పని కోసం ఆమోదం అడిగారు. మీరు ఒంటరిగా పనిచేస్తారో, వ్యక్తులను అందించే ఏజెన్సీనో, లేదా పూర్తి పనులు తీసుకునే వెండర్‌నో మాకు చెప్పండి — ఇది టాక్స్ మరియు చెల్లింపు ఎలా పనిచేస్తుందో నిర్ణయిస్తుంది.",
  "me.capability.plan.businessType.whyDefault":
    "మీరు వర్క్‌ఫోర్స్ లేదా ప్రాజెక్ట్ పని కోసం అప్లై చేసినప్పుడు అడుగుతాం. అప్పటి వరకు మీరు ఒంటరిగా పనిచేస్తున్నట్టు పరిగణిస్తాం.",
  "me.capability.plan.businessType.action": "మీరు ఎలా పనిచేస్తారో మాకు చెప్పండి",
  "me.capability.plan.capacity.title": "మీరు ఎంత తీసుకోగలరు",
  "me.capability.plan.capacity.whyTemplate":
    "{names} కోసం మా వద్ద రికార్డ్ చేసిన పరిమితి లేదు. ఇది లేకుండా మీరు సిబ్బందిని పెట్టలేని పనిని మీకు పంపకుండా మేము ఆపలేం.",
  "me.capability.plan.capacity.action": "మీ పరిమితిని సెట్ చేయండి",
  "me.capability.plan.skills.title": "మీరు ఏం చేయగలరు",
  "me.capability.plan.skills.whyAsked":
    "మీకు ఏ ఎంక్వైరీలు అర్హత ఉందో స్కిల్స్ నిర్ణయిస్తాయి. స్కిల్స్ లేని సామర్థ్యం మేము మీకు ఎప్పుడూ పంపని పనికి ఆమోదించబడుతుంది.",
  "me.capability.plan.skills.whyDefault":
    "మీరు స్పెషలిస్ట్ పని కోసం అప్లై చేసినప్పుడు అడుగుతాం. ఒక స్కిల్ తనంతట తానే వర్క్‌స్పేస్‌ని ఆన్ చేయదు.",
  "me.capability.plan.skills.action": "మీ స్కిల్స్‌ని జోడించండి",
  "me.capability.plan.experience.title": "మీరు ఇది ఎంతకాలంగా చేస్తున్నారు",
  "me.capability.plan.experience.why":
    "కస్టమర్లు దీన్ని మీ ప్రొఫైల్‌లో చదువుతారు, మరియు ఇద్దరు వెండర్లు ఒకే ధరను కోట్ చేసినప్పుడు ఇది సహాయపడుతుంది.",
  "me.capability.plan.experience.action": "మీ అనుభవాన్ని జోడించండి",
  "me.capability.plan.availability.title": "మీ వర్కింగ్ గంటలు",
  "me.capability.plan.availability.whyApproved":
    "మీరు పని కోసం ఆమోదించబడ్డారు. మీరు ప్రకటించిన గంటల్లోనే మేము ఎంక్వైరీలు పంపుతాం, కాబట్టి ఖాలీ వారం అంటే మీకు ఏమీ రాదు.",
  "me.capability.plan.availability.whyDefault": "మీరు అప్లై చేసిన ఒకటి ఆమోదించబడిన వెంటనే అడుగుతాం.",
  "me.capability.plan.availability.action": "మీ గంటలను సెట్ చేయండి",
  "me.capability.plan.documentsExpired.title": "ఒక పత్రం గడువు ముగిసింది",
  "me.capability.plan.documentsExpired.whyTemplate":
    "మీరు దాన్ని మార్చే వరకు కొత్త ఎంక్వైరీలు రావు: {kinds}. మీరు ఇప్పటికే చేపట్టిన పనిపై ప్రభావం ఉండదు.",
  "me.capability.plan.documentsExpired.action": "దాన్ని మార్చండి",
  "me.capability.plan.documents.title": "మీ ID మరియు అడ్రస్ ప్రూఫ్",
  "me.capability.plan.documents.why":
    "మీరు మీ మొదటి పనిని అంగీకరించే ముందు అడుగుతాం, కాబట్టి ఎవరు వస్తున్నారో కస్టమర్లకు తెలుస్తుంది. పనిని చూసే ముందు కాదు.",
  "me.capability.plan.documents.action": "మీ పత్రాలను జోడించండి",
  "me.capability.plan.documentExpiry.title": "ఒక పత్రం త్వరలో గడువు ముగుస్తుంది",
  "me.capability.plan.documentExpiry.why": {
    other: "మాకు కావాల్సిన పత్రాల్లో ఒకటి {days} రోజుల్లో గడువు ముగుస్తుంది. దానికి ముందు మార్చడం ఎంక్వైరీలు రావడాన్ని కొనసాగిస్తుంది.",
    one: "మాకు కావాల్సిన పత్రాల్లో ఒకటి {days} రోజులో గడువు ముగుస్తుంది. దానికి ముందు మార్చడం ఎంక్వైరీలు రావడాన్ని కొనసాగిస్తుంది.",
  },
  "me.capability.plan.documentExpiry.action": "ముందుగానే మార్చండి",
  "me.capability.plan.insurance.title": "వర్కర్ ఇన్సూరెన్స్",
  "me.capability.plan.insurance.whyExpired":
    "మీరు డిక్లేర్ చేసిన కవర్ ముగిసింది. ఇది రెన్యూ అయ్యే వరకు వర్క్‌ఫోర్స్ ఎంక్వైరీలు మీకు రావు.",
  "me.capability.plan.insurance.whyRequired":
    "మీరు వ్యక్తులను మరొకరి సైట్‌కు పంపుతున్నారు. అక్కడ వారికి ఏదైనా జరిగితే ఎవరు కవర్ చేస్తారో ఈ పని ఆమోదించబడే ముందు మాకు తెలియాలి.",
  "me.capability.plan.insurance.whyDefault":
    "మీరు వ్యక్తులను కస్టమర్ సైట్‌కు పంపే పని కోసం అప్లై చేసినప్పుడు అడుగుతాం.",
  "me.capability.plan.insurance.action": "మీ కవర్‌ని డిక్లేర్ చేయండి",
  "me.capability.plan.gate.kyc.title": "గుర్తింపు తనిఖీ",
  "me.capability.plan.gate.payout.title": "డబ్బు ఎక్కడికి వెళ్తుంది",
  "me.capability.plan.gate.crew.title": "మీరు ఎవరిని పంపుతారు",
  "me.capability.plan.done": "పూర్తయింది.",
  "me.capability.plan.loading": "మీకు ఇంకా ఏం అవసరమో నిర్ధారిస్తోంది",
  "me.capability.plan.nowHeading": {
    other: "{count} చేయవలసిన విషయాలు",
    one: "ఒక చేయవలసిన విషయం",
  },
  "me.capability.plan.nothingNeededTitle": "మీ నుండి ఏమీ అవసరం లేదు",
  "me.capability.plan.nothingNeededCompleteBody":
    "మేము అడిగినవన్నీ ఫైల్‌లో ఉన్నాయి. ఎంక్వైరీలు వచ్చినప్పుడు మీకు చేరతాయి.",
  "me.capability.plan.nothingNeededPendingBody":
    "ఇప్పుడు మీ కోసం ఏదీ ఆగలేదు. అవి ముఖ్యమైనప్పుడు దిగువ ఉన్నవాటిని మేము అడుగుతాం.",
  "me.capability.plan.laterHeading": "వీటిని మేము తర్వాత అడుగుతాం",
  "me.capability.plan.doneHeading": "ఇప్పటికే పూర్తయింది ({count})",

  "me.capability.screen.specialistWork.title": "స్పెషలిస్ట్ పని",
  "me.capability.screen.specialistWork.description":
    "రోజువారీగా సిబ్బందిని అందించడం, లేదా పూర్తి ప్రాజెక్ట్‌కి కోట్ చేయడం సాధారణ పనుల కంటే వేరుగా రివ్యూ చేయబడుతుంది. అడగడానికి ఖర్చు ఏమీ లేదు మరియు మీరు ఇప్పటికే చేస్తున్న పనిపై ప్రభావం ఉండదు.",
  "me.capability.screen.whereRequestsStand": "మీ అభ్యర్థనలు ఎక్కడ ఉన్నాయి",
  "me.capability.screen.askToBeApproved": "ఆమోదం కోసం అడగండి",
  "me.capability.screen.howYouWork.title": "మీరు ఎలా పనిచేస్తారు",
  "me.capability.screen.howYouWork.description":
    "ఎవరు సంతకం చేస్తారు, ఎవరు బాధ్యత వహిస్తారు మరియు కస్టమర్ ఎవరికి చెల్లిస్తారు అని ఇది నిర్ణయిస్తుంది. మీరు అందించే సేవల నుండి మేము దీన్ని ఎప్పుడూ తెలుసుకోలేం.",
  "me.capability.screen.loadingDetails": "మీ వివరాలు లోడ్ అవుతున్నాయి…",
  "me.capability.screen.loadOptionsErrorTitle": "మేము ఆప్షన్‌లను లోడ్ చేయలేకపోయాం",
  "me.capability.screen.loadOptionsErrorMessage":
    "మీరు ఎంటర్ చేసినది ఏదీ పోలేదు. మీ కనెక్షన్‌ని చూసి మళ్ళీ ప్రయత్నించండి.",
  "me.capability.business.legalNameLabel": "నమోదైన బిజినెస్ పేరు",
  "me.capability.business.legalNameDescription": "మీ వద్ద ఒకటి ఉంటే, మీ రిజిస్ట్రేషన్‌లో ఉన్నట్టే.",
  "me.capability.business.registrationNumberLabel": "రిజిస్ట్రేషన్ నంబర్",
  "me.capability.business.gstRegisteredLabel": "నేను GST రిజిస్టర్ అయ్యాను",
  "me.capability.business.gstinLabel": "GSTIN",
  "me.capability.business.yearsInOperationLabel": "పనిచేస్తున్న సంవత్సరాలు",
  "me.capability.business.expectedNameHint":
    "ఏజెన్సీ లేదా వెండర్‌ని సాధారణంగా నమోదైన బిజినెస్ పేరు కోసం అడుగుతారు. ఒకటి లేకుండా సేవ్ చేసి తర్వాత జోడించవచ్చు.",
  "me.capability.business.saveErrorTitle": "దీన్ని సేవ్ చేయలేకపోయాం",
  "me.capability.business.saved": "సేవ్ చేయబడింది.",
  "me.capability.backToSpecialistWork": "స్పెషలిస్ట్ పనికి తిరిగి వెళ్ళండి",
  "me.capability.screen.insurance.title": "వర్కర్ ఇన్సూరెన్స్",
  "me.capability.screen.insurance.description":
    "వర్క్‌ఫోర్స్ సామర్థ్యాలు ఆమోదించబడే ముందు తప్పనిసరి. ఆపరేషన్స్ దీన్ని చెక్ చేస్తుంది — అప్పటి వరకు ఇది ఒక డిక్లరేషన్, మేము నిలబడిన కవర్ కాదు.",
  "me.capability.screen.loadingDeclaration": "మీ డిక్లరేషన్ లోడ్ అవుతోంది…",
  "me.capability.screen.loadDeclarationErrorTitle": "మేము మీ డిక్లరేషన్‌ని లోడ్ చేయలేకపోయాం",
  "me.capability.screen.demand.title": "మీ దగ్గర పని",
  "me.capability.screen.demand.description":
    "మీరు ఎంచుకున్న ప్రాంతాల్లోని కస్టమర్ల నుండి లైవ్ రిక్వెస్ట్‌లు. ఒక కస్టమర్ మిమ్మల్ని ఇన్‌వైట్ చేసే వరకు పేర్లు, ఫోన్ నంబర్లు మరియు ఖచ్చితమైన అడ్రస్‌లు దాచబడతాయి.",
  "me.capability.screen.demand.finishStepsTitle": "పనిని చూడటానికి పై స్టెప్‌లను పూర్తి చేయండి",
  "me.capability.screen.demand.finishStepsBody":
    "మేము మీకు ఇచ్చిన సేవ మరియు నగరానికి వ్యతిరేకంగా రిక్వెస్ట్‌లను సరిపోల్చుతాం. రెండూ ఉన్న వరకు ఇక్కడ మీకు చూపించడానికి నిజమైనది ఏదీ లేదు.",

  "me.capability.businessChoice.legend": "మీరు ఎలా పనిచేస్తారు?",
  "me.capability.businessChoice.description":
    "మీకు ఎవరు చెల్లిస్తారు మరియు టాక్స్ ఎలా నిర్వహించబడుతుంది అని ఇది నిర్ణయిస్తుంది. మీరు దీన్ని తర్వాత మార్చవచ్చు.",

  "me.capability.picker.loading": "మీరు అప్లై చేయగల పనిని లోడ్ చేస్తోంది",
  "me.capability.picker.emptyTitle": "ఇంకా అప్లై చేయడానికి ఏమీ లేదు",
  "me.capability.picker.emptyDescription":
    "మీరు ఎంచుకున్న సేవలు వర్క్‌ఫోర్స్ లేదా ప్రాజెక్ట్ వెండర్లకు తెరవబడలేదు. “మీ పని”పై మరో సేవను జోడించడం ఒకదాన్ని తెరవగలదు.",
  "me.capability.picker.alreadyAsked": "ఇప్పటికే అడిగారు",
  "me.capability.picker.platformPaidNote": "కస్టమర్ ఆమోదించే వరకు చెల్లింపులోని ప్రతి దశను Vsolve ఉంచుకుంటుంది.",
  "me.capability.picker.directPaidNote": "కస్టమర్ నేరుగా మీకు చెల్లిస్తారు.",
  "me.capability.picker.insuranceNote": "ఇది ఆమోదించబడే ముందు మీరు వర్కర్ ఇన్సూరెన్స్ కోసం అడగబడతారు.",
  "me.capability.picker.alreadyRequestedNote":
    "దీని కోసం మీకు ఒక లైవ్ రిక్వెస్ట్ ఉంది. దాని ప్రగతి మీ సామర్థ్యాల లిస్ట్‌లో ఉంది.",
  "me.capability.picker.unsupportedPrefix": "ఈ సేవ మీ యాప్ ఇంకా చూపించలేని విషయాన్ని అడుగుతుంది",
  "me.capability.picker.unsupportedSuffix": "యాప్‌ని అప్‌డేట్ చేయండి, లేదా సమాధానాన్ని రికార్డ్ చేయడానికి సపోర్ట్‌ని అడగండి.",
  "me.capability.picker.sendingRequest": "మీ అభ్యర్థనను పంపుతోంది",
  "me.capability.picker.submitButton": "ఆమోదం కోసం అడగండి",
  "me.capability.picker.reviewNote":
    "ఇది ఆన్ అయ్యే ముందు మేము దీన్ని రివ్యూ చేస్తాం. ఒక స్కిల్‌ని ఎంచుకోవడం తనంతట తానే ఈ పనిని తెరవదు.",
  "me.capability.picker.chooseOne": "ఒకటి ఎంచుకోండి",

  "me.capability.statusList.loading": "మీరు ఏ దాని కోసం ఆమోదించబడ్డారో లోడ్ అవుతోంది",
  "me.capability.statusList.emptyTitle": "మీరు ఇంకా ఏ స్పెషలిస్ట్ పని కోసం అడగలేదు",
  "me.capability.statusList.emptyDescription":
    "వర్క్‌ఫోర్స్ మరియు ప్రాజెక్ట్ పని ఆన్ అయ్యే ముందు ఆమోదం అవసరం. మీ ఖాతాలో మిగిలినదంతా ఇప్పటిలాగే పనిచేస్తుంది.",
  "me.capability.statusList.decidedLabel": "నిర్ణయించబడింది",
  "me.capability.statusList.referenceSuffix": " · రెఫరెన్స్ {code}",

  "me.capability.demand.loading": "మీ దగ్గర పనిని లోడ్ చేస్తోంది",
  "me.capability.demand.ineligibleNotice":
    "మీ దగ్గర ఇది అడగబడుతున్న నిజమైన పని. మీరు స్పందించే ముందు ఈ సేవల కోసం ఆమోదం అవసరం — ఏది అని ప్రతి కార్డ్ చెప్తుంది.",
  "me.capability.demand.privacyNote":
    "ఒక కస్టమర్ మిమ్మల్ని ఇన్‌వైట్ చేసే వరకు పేర్లు, ఫోన్ నంబర్లు మరియు ఖచ్చితమైన అడ్రస్‌లు దాచబడతాయి.",
  "me.capability.demand.emptyNoMatchTitle": "మీ సేవలకు ఇంకా ఏదీ సరిపోలేదు",
  "me.capability.demand.emptyNoMatchDescription":
    "మీరు చేసే ఒక విషయం మరియు మీరు పనిచేసే ఒక ప్రాంతం మాకు చెప్పారు. ఏదైనా ఒకటి ఇంకా జోడించడం మీకు చేరేదాన్ని విస్తరిస్తుంది.",
  "me.capability.demand.emptyNoneNearbyTitle": "ఇప్పుడు మీ ప్రాంతంలో ఏమీ లేదు",
  "me.capability.demand.emptyNoneNearbyDescription":
    "పని రోజంతా వస్తుంది. మీరు చేసేదానికి సరిపోయేది వచ్చినప్పుడు మేము మీకు మెసేజ్ చేస్తాం.",
  "me.capability.demand.noStartDate": "ఇంకా ప్రారంభ తేదీ ఇవ్వలేదు",
  "me.capability.demand.startsLabel": "మొదలవుతుంది",
  "me.capability.demand.eligibleNote": "మీరు దీనికి ఇన్‌వైట్ చేయబడగలరు.",
  "me.capability.demand.ineligibleFallbackHint": "ఈ రకమైన పని కోసం మీరు ఇంకా ఆమోదించబడలేదు.",

  "me.capability.express.title": "పని తీసుకోవడం మొదలుపెట్టండి",
  "me.capability.express.readyBody": "మీరు సెటప్ అయ్యారు. మీ దగ్గర ఉన్నవారు అడుగుతున్నది ఇదే.",
  "me.capability.express.stepsRemainingTemplate": "నాలుగు చిన్న స్టెప్‌లు. ఇంకా {remaining} మిగిలాయి.",
  "me.capability.express.ariaStepsProgress": "సెటప్ స్టెప్‌లు, {total}లో {done} పూర్తయ్యాయి",
  "me.capability.express.srDone": "పూర్తయింది",
  "me.capability.express.srNotDone": "ఇంకా పూర్తవ్వలేదు",
  "me.capability.express.seeWhatPeopleNeed": "వారికి ఏం కావాలో చూడండి",
  "me.capability.express.documentsLaterNote":
    "మీరు మీ మొదటి పనిని అంగీకరించినప్పుడు పత్రాల కోసం అడుగుతాం — ఇప్పుడు కాదు.",
  "me.capability.express.step.phone.label": "మీ నంబర్",
  "me.capability.express.step.phone.ask": "మేము మీకు ఒక కోడ్‌ని టెక్స్ట్ చేస్తాం. గుర్తుంచుకోవాల్సిన పాస్‌వర్డ్ లేదు.",
  "me.capability.express.step.identity.label": "మీ పేరు",
  "me.capability.express.step.identity.ask":
    "కస్టమర్లు చూసేది, మరియు మీరు ఒంటరిగా పనిచేస్తారో లేదా టీమ్‌ని నడుపుతారో.",
  "me.capability.express.step.service.label": "ఒక సేవ",
  "me.capability.express.step.service.ask": "మీరు చేసే ఒక పనిని ఎంచుకోండి. తర్వాత మరిన్ని జోడించవచ్చు.",
  "me.capability.express.step.area.label": "ఒక నగరం",
  "me.capability.express.step.area.ask": "మీకు పని కావాల్సిన ప్రాంతం. తర్వాత మరిన్ని జోడించవచ్చు.",

  "me.capability.gateNotice.heading": "మీరు {action} చేసే ముందు ఒక విషయం",

  "me.capability.insuranceForm.intro":
    "మీరు వ్యక్తులను మరొకరి సైట్‌కు పంపుతున్నారు. అక్కడ ఏదైనా తప్పు జరిగితే వారిని కవర్ చేసేది ఇదే.",
  "me.capability.insuranceForm.insurerLabel": "ఇన్సూరర్",
  "me.capability.insuranceForm.policyNumberLabel": "పాలసీ నంబర్",
  "me.capability.insuranceForm.policyNumberDescription": "పత్రంలో ఉన్నట్టే ఖచ్చితంగా.",
  "me.capability.insuranceForm.amountCoveredLabel": "కవర్ చేయబడిన మొత్తం (₹)",
  "me.capability.insuranceForm.coverStartsLabel": "కవర్ మొదలవుతుంది",
  "me.capability.insuranceForm.coverEndsLabel": "కవర్ ముగుస్తుంది",
  "me.capability.insuranceForm.wcLabel": "ఈ పాలసీలో వర్క్‌మెన్స్ కాంపెన్సేషన్ ఉంది.",
  "me.capability.insuranceForm.wcHelp": "కొన్ని కన్‌స్ట్రక్షన్ మరియు ఇండస్ట్రియల్ పనులు దీని లేకుండా ఆమోదించబడవు.",
  "me.capability.insuranceForm.updateButton": "డిక్లరేషన్‌ని అప్‌డేట్ చేయండి",
  "me.capability.insuranceForm.saveButton": "డిక్లరేషన్‌ని సేవ్ చేయండి",
  "me.capability.insuranceForm.footerNote":
    "వర్క్‌ఫోర్స్ సామర్థ్యాలను ఆమోదించే ముందు దీన్ని మేము చెక్ చేస్తాం. కవర్ ఉందని చెప్పి లేకపోవడం సస్పెన్షన్‌కు కారణం అవుతుంది.",
  "me.capability.insuranceForm.checkedBadge": "చెక్ చేయబడింది",
  "me.capability.insuranceForm.notCheckedBadge": "ఇంకా చెక్ చేయలేదు",
  "me.capability.insuranceForm.expiredBadge": "గడువు ముగిసింది",
  "me.capability.insuranceForm.endingSoonBadge": "త్వరలో ముగుస్తుంది",
  "me.capability.insuranceForm.coverLabel": "కవర్",
  "me.capability.insuranceForm.coverCaption": "{insurer} · {validTo} వరకు",
  "me.capability.insuranceForm.expiredNote":
    "ఈ కవర్ ముగిసింది. ఇది రెన్యూ అయ్యే వరకు వర్క్‌ఫోర్స్ ఎంక్వైరీలు రావు.",
  "me.capability.insuranceForm.endingSoonTemplate": {
    other: "{days} రోజుల్లో ముగుస్తుంది. మీ పనికి అంతరాయం రాకుండా దానికి ముందు రెన్యూ చేయండి.",
    one: "{days} రోజులో ముగుస్తుంది. మీ పనికి అంతరాయం రాకుండా దానికి ముందు రెన్యూ చేయండి.",
  },
};

const hi: Catalog = {
  "me.language.backToAccount": "खाते पर वापस जाएं",
  "me.language.confirm": "भाषा की पुष्टि करें",

  "me.home.srTitle": "पार्टनर खाता और सेटिंग्स",
  "me.home.sectionAccountProfile": "खाता और प्रोफ़ाइल",
  "me.home.personalProfileTitle": "पर्सनल प्रोफ़ाइल",
  "me.home.personalProfileSubtitle": "संपर्क जानकारी, काम और KYC दस्तावेज़",
  "me.home.appLanguageTitle": "ऐप भाषा",
  "me.home.appLanguageSubtitle": "अंग्रेज़ी (भारत)",
  "me.home.sectionWorkFinancials": "काम और वित्त",
  "me.home.moneyTitle": "पैसा और कमाई",
  "me.home.moneySubtitle": "रोज़ाना कमाई, पासबुक और सेटलमेंट",
  "me.home.crewTitle": "कॉन्ट्रैक्टर टीम",
  "me.home.crewSubtitle": "टीम रोस्टर और टीम डिस्पैच मैनेज करें",
  "me.home.sectionSupportSafety": "सहायता और सुरक्षा",
  "me.home.helplineTitle": "पार्टनर हेल्पलाइन",
  "me.home.verified": "सत्यापित",
  "me.home.defaultName": "पार्टनर",

  "me.profile.approval.approved.title": "आप काम ले सकते हैं",
  "me.profile.approval.approved.body": "आपका खाता स्वीकृत है। ऑफर मिलना शुरू करने के लिए ऑनलाइन जाएं।",
  "me.profile.approval.submitted.title": "हम आपकी जानकारी जाँच रहे हैं",
  "me.profile.approval.submitted.body": "अभी कुछ करने की ज़रूरत नहीं है। यह पूरा होते ही हम आपको बताएंगे।",
  "me.profile.approval.underReview.title": "हम आपकी जानकारी जाँच रहे हैं",
  "me.profile.approval.underReview.body": "अभी कुछ करने की ज़रूरत नहीं है। यह पूरा होते ही हम आपको बताएंगे।",
  "me.profile.approval.changesRequired.title": "हमें आपसे कुछ चाहिए",
  "me.profile.approval.changesRequired.body":
    "क्या ठीक करना है यह देखने के लिए अपना आवेदन खोलें। यह पूरा होने तक आपको काम नहीं मिलेगा।",
  "me.profile.approval.draft.title": "आपका आवेदन पूरा नहीं हुआ है",
  "me.profile.approval.draft.body": "काम मिलना शुरू करने के लिए इसे पूरा करें।",
  "me.profile.approval.rejected.title": "यह खाता काम नहीं ले सकता",
  "me.profile.approval.rejected.body": "अगर आपको लगता है यह गलत है तो सपोर्ट से बात करें।",
  "me.profile.noProfileTitle": "आपका अभी पार्टनर प्रोफ़ाइल नहीं है",
  "me.profile.noProfileMessage": "अपना आवेदन पूरा करें और हम एक सेट कर देंगे।",
  "me.profile.openApplication": "मेरा आवेदन खोलें",
  "me.profile.loadErrorTitle": "हम आपकी प्रोफ़ाइल लोड नहीं कर सके",
  "me.profile.phoneChangeNote":
    "अपना फ़ोन नंबर बदलने के लिए सपोर्ट से बात करें — इसी से आप साइन इन करते हैं, इसलिए इसे बदलने से पहले हम इसकी जाँच करते हैं।",
  "me.profile.pickupLocationLabel": "डिफ़ॉल्ट पिकअप लोकेशन",
  "me.profile.whatYouDoLabel": "आप क्या करते हैं",
  "me.profile.whereYouWorkLabel": "आप कहाँ काम करते हैं",
  "me.profile.withUsSinceLabel": "हमारे साथ कब से हैं",
  "me.profile.gettingPaidLabel": "भुगतान पाना",
  "me.profile.locationNotSet": "अभी सेट नहीं है — रेंटल विज्ञापनों को पहले से भरने के लिए इस्तेमाल होता है",
  "me.profile.notSetYet": "अभी सेट नहीं है",
  "me.profile.experienceYears": {
    other: "{count} साल का अनुभव",
    one: "{count} साल का अनुभव",
  },
  "me.profile.bankReady": "आपका बैंक खाता तैयार है",
  "me.profile.bankNotReady": "अभी बैंक खाता नहीं है — यह जुड़ने तक हम आपको भुगतान नहीं कर सकते।",
  "me.profile.manageHeading": "मैनेज करें",
  "me.profile.myBookings": "मेरी बुकिंग",
  "me.profile.myApplication": "मेरा आवेदन और दस्तावेज़",
  "me.profile.myMoney": "मेरा पैसा",
  "me.profile.addAction": "जोड़ें",
  "me.profile.editName.title": "अपना नाम बदलें",
  "me.profile.editName.description": "यह वह नाम है जो कस्टमर आपके पहुँचने पर देखते हैं।",
  "me.profile.editName.nameLabel": "आपका नाम",
  "me.profile.editLocation.title": "डिफ़ॉल्ट पिकअप लोकेशन",
  "me.profile.editLocation.description":
    "रेंटल विज्ञापनों को पहले से भरने के लिए इस्तेमाल होता है। आप हर विज्ञापन में लोकेशन बदल सकते हैं।",
  "me.profile.editLocation.addressLabel": "पिकअप / रजिस्टर किया हुआ पता",
  "me.profile.editLocation.addressPlaceholder": "इलाका, शहर",

  "me.capability.business.refusalNoRegistration":
    "खुद के तौर पर काम करने का मतलब है दर्ज करने के लिए कोई कंपनी रजिस्ट्रेशन नहीं है। अगर आपके पास है तो बिज़नेस टाइप चुनें।",
  "me.capability.business.refusalGstinNeedsFlag":
    "GSTIN जोड़ने से पहले “मैं GST रजिस्टर्ड हूं” पर टिक करें, या GSTIN हटाएं।",
  "me.capability.ask.maxCrewSize.label": "एक बार में आप भेज सकने वाले सबसे ज़्यादा वर्कर",
  "me.capability.ask.maxCrewSize.help": "एक असली संख्या। आप जो स्टाफ नहीं कर सकते वह काम आपको भेजने से रोकने के लिए इसे इस्तेमाल करते हैं।",
  "me.capability.ask.maxProjectValue.label": "सबसे बड़ा प्रोजेक्ट जिसके लिए आप कोट करना चाहते हैं",
  "me.capability.ask.maxProjectValue.help": "यह एक सीमा है, वादा नहीं। इससे कहीं ज़्यादा का काम आपको नहीं दिखाया जाएगा।",

  "me.capability.status.requested.label": "अनुरोध किया गया",
  "me.capability.status.requested.headline": "हमारे पास आपका अनुरोध है",
  "me.capability.status.requested.detail":
    "यह जल्द ही रिव्यू क्यू में शामिल हो जाएगा। अभी आपसे कुछ और नहीं चाहिए, और इस बीच आप काम देखते रह सकते हैं।",
  "me.capability.status.underReview.label": "रिव्यू में है",
  "me.capability.status.underReview.headline": "कोई आपका अनुरोध जाँच रहा है",
  "me.capability.status.underReview.detail":
    "अभी आपसे कुछ और नहीं चाहिए। कुछ भी अस्पष्ट होने पर हम इसे ठुकराने के बजाय सीधे आपसे पूछेंगे।",
  "me.capability.status.approved.label": "स्वीकृत",
  "me.capability.status.approved.headline": "आप यह काम ले सकते हैं",
  "me.capability.status.approved.detail": "इस सेवा के लिए एंक्वायरी आपके पास आना शुरू हो जाएंगी।",
  "me.capability.status.withdrawn.label": "आपने बंद किया",
  "me.capability.status.withdrawn.headline": "आपने यह अनुरोध बंद किया",
  "me.capability.status.withdrawn.detail":
    "इसकी समीक्षा नहीं हो रही और यह आपको इस काम तक पहुँच नहीं देता। फिर से पूछना एक नई समीक्षा शुरू करता है — इसे बंद करना आपके खिलाफ नहीं गिना जाता।",
  "me.capability.status.withdrawn.secondaryActionLabel": "मैंने इसे बंद नहीं किया",
  "me.capability.status.unknown.label": "अज्ञात",
  "me.capability.status.unknown.headline": "यह अनुरोध हम बता नहीं सकते",
  "me.capability.status.unknown.detail":
    "आपका ऐप Vsolve के इस हिस्से से पुराना है। इसे अपडेट करें, या सपोर्ट से बात करें, हम आपको बताएंगे कि यह कहाँ खड़ा है।",
  "me.capability.status.expired.label": "समय सीमा समाप्त",
  "me.capability.status.expired.headline": "इस काम के लिए आपकी स्वीकृति समाप्त हो गई",
  "me.capability.status.expired.detail":
    "आपको इसके लिए नई एंक्वायरी नहीं मिलेंगी। फिर से पूछना तेज़ है — आपने जो भेजा था वह हम रखते हैं।",
  "me.capability.status.documentExpired.label": "दस्तावेज़ की समय सीमा समाप्त",
  "me.capability.status.documentExpired.headline": "हमें चाहिए एक दस्तावेज़ की समय सीमा समाप्त हो गई",
  "me.capability.status.documentExpired.detail":
    "आपके इसे बदलने तक इस काम के लिए नई एंक्वायरी नहीं आएंगी: {kinds}। आपने जो काम पहले ही लिया है उस पर असर नहीं पड़ेगा।",
  "me.capability.status.changesNeeded.label": "बदलाव ज़रूरी",
  "me.capability.status.changesNeeded.headline": "हमें कुछ ठीक करना है",
  "me.capability.status.changesNeeded.detailFallback":
    "एक रिव्यूअर ने बदलाव माँगे लेकिन बताया नहीं क्या। सपोर्ट से बात करें, हम आपको बताएंगे कि क्या ज़रूरी है।",
  "me.capability.status.rejected.label": "स्वीकृत नहीं हुआ",
  "me.capability.status.rejected.headline": "हम इसे स्वीकृत नहीं कर सके",
  "me.capability.status.rejected.detailFallback":
    "एक रिव्यूअर ने इसे मना किया लेकिन बताया नहीं क्यों। सपोर्ट से बात करें, हम आपको बताएंगे।",
  "me.capability.status.rejected.detailSuffix":
    " इसके ठीक होने पर यह आपको उसी काम के लिए फिर से पूछने से नहीं रोकता।",
  "me.capability.status.suspended.label": "सस्पेंड किया गया",
  "me.capability.status.suspended.headline": "यह काम आपके खाते पर रुका हुआ है",
  "me.capability.status.suspended.detail":
    "आपको इसके लिए नई एंक्वायरी नहीं मिलेंगी। आपने जो काम पहले ही लिया है वह दिखता रहेगा। इस पर चर्चा के लिए सपोर्ट से बात करें।",
  "me.capability.action.askAgain": "फिर से पूछें",
  "me.capability.action.contactSupport": "सपोर्ट से बात करें",
  "me.capability.action.replaceDocument": "दस्तावेज़ बदलें",
  "me.capability.action.fixAndResend": "ठीक करें और फिर भेजें",
  "me.capability.action.askUsWhy": "हमसे वजह पूछें",
  "me.capability.action.waitMessage": "अभी कुछ करने की ज़रूरत नहीं है। यह बदलने पर हम आपको मेसेज करेंगे।",

  "me.capability.gate.action.finishApplication": "अपना आवेदन पूरा करें",
  "me.capability.gate.action.addBankDetails": "अपनी बैंक जानकारी जोड़ें",
  "me.capability.gate.action.addCrew": "अपनी टीम जोड़ें",
  "me.capability.gate.fallbackReason":
    "यह करने से पहले हमें एक और चीज़ चाहिए। सपोर्ट से बात करें, हम आपको बताएंगे क्या।",

  "me.capability.insurance.problem.insurerName": "अपने इंश्योरर का नाम जोड़ें।",
  "me.capability.insurance.problem.policyReference":
    "पॉलिसी नंबर जोड़ें, ठीक वैसा जैसा दस्तावेज़ पर है।",
  "me.capability.insurance.problem.coverage": "पॉलिसी कितना कवर करती है यह जोड़ें।",
  "me.capability.insurance.problem.datesMissing": "वे तारीखें जोड़ें जिनके बीच पॉलिसी चलती है।",
  "me.capability.insurance.problem.datesInvalid":
    "पॉलिसी शुरू होने के बाद ही खत्म होनी चाहिए। दोनों तारीखें जाँचें।",

  "me.capability.plan.identity.title": "आपका नाम",
  "me.capability.plan.identity.why": "कस्टमर आपको अपने घर में आने देने से पहले यह देखते हैं।",
  "me.capability.plan.identity.action": "अपना नाम जोड़ें",
  "me.capability.plan.services.title": "एक सेवा",
  "me.capability.plan.services.why":
    "वह एक काम जो आप करते हैं। हम इसके आधार पर काम मिलाते हैं — आप बाद में और जोड़ सकते हैं।",
  "me.capability.plan.services.action": "एक सेवा चुनें",
  "me.capability.plan.areas.title": "एक शहर",
  "me.capability.plan.areas.why": "वह जगह जहाँ आप काम चाहते हैं। आप बाद में और जोड़ सकते हैं।",
  "me.capability.plan.areas.action": "अपनी काम की जगह चुनें",
  "me.capability.plan.capability.title": "वर्कफ़ोर्स या प्रोजेक्ट स्वीकृति",
  "me.capability.plan.capability.whyAsked": "आपने स्वीकृति माँगी है। इसकी प्रगति नीचे है।",
  "me.capability.plan.capability.whyDefault":
    "दिन के हिसाब से टीम देना या पूरे प्रोजेक्ट के लिए कोट करना सामान्य काम से अलग रिव्यू होता है। जब चाहें तब पूछें — ब्राउज़ करने के लिए यह ज़रूरी नहीं है।",
  "me.capability.plan.capability.action": "देखें आप किसके लिए अप्लाई कर सकते हैं",
  "me.capability.plan.businessType.title": "आप कैसे काम करते हैं",
  "me.capability.plan.businessType.whyAsked":
    "आपने स्पेशलिस्ट काम के लिए स्वीकृति माँगी है। हमें बताएं कि यह आप खुद हैं, लोग देने वाली एजेंसी हैं, या पूरे काम लेने वाले वेंडर हैं — यह तय करता है कि टैक्स और भुगतान कैसे काम करता है।",
  "me.capability.plan.businessType.whyDefault":
    "जब आप वर्कफ़ोर्स या प्रोजेक्ट काम के लिए अप्लाई करते हैं तब पूछा जाता है। तब तक हम आपको खुद काम करने वाला मानते हैं।",
  "me.capability.plan.businessType.action": "हमें बताएं आप कैसे काम करते हैं",
  "me.capability.plan.capacity.title": "आप कितना काम ले सकते हैं",
  "me.capability.plan.capacity.whyTemplate":
    "{names} के लिए हमारे पास दर्ज सीमा नहीं है। इसके बिना हम आपको वह काम भेजने से नहीं रोक सकते जिसके लिए आपके पास स्टाफ नहीं है।",
  "me.capability.plan.capacity.action": "अपनी सीमा सेट करें",
  "me.capability.plan.skills.title": "आप क्या कर सकते हैं",
  "me.capability.plan.skills.whyAsked":
    "स्किल्स तय करती हैं कि आप किन एंक्वायरी के लिए योग्य हैं। बिना स्किल्स के एक क्षमता उस काम के लिए स्वीकृत है जो हम आपको कभी नहीं भेजेंगे।",
  "me.capability.plan.skills.whyDefault":
    "जब आप स्पेशलिस्ट काम के लिए अप्लाई करते हैं तब पूछा जाता है। एक स्किल खुद से कोई वर्कस्पेस ऑन नहीं करती।",
  "me.capability.plan.skills.action": "अपनी स्किल्स जोड़ें",
  "me.capability.plan.experience.title": "आप यह कितने समय से कर रहे हैं",
  "me.capability.plan.experience.why":
    "कस्टमर इसे आपकी प्रोफ़ाइल पर पढ़ते हैं और जब दो वेंडर एक ही दाम कोट करते हैं तब यह मदद करता है।",
  "me.capability.plan.experience.action": "अपना अनुभव जोड़ें",
  "me.capability.plan.availability.title": "आपके घंटे",
  "me.capability.plan.availability.whyApproved":
    "आप काम के लिए स्वीकृत हैं। हम सिर्फ आपके बताए घंटों में एंक्वायरी भेजते हैं, तो खाली हफ़्ता मतलब आपके पास कुछ नहीं आता।",
  "me.capability.plan.availability.whyDefault": "जब आपने अप्लाई किया कुछ स्वीकृत होता है तब पूछा जाता है।",
  "me.capability.plan.availability.action": "अपने घंटे सेट करें",
  "me.capability.plan.documentsExpired.title": "एक दस्तावेज़ की समय सीमा समाप्त हो गई",
  "me.capability.plan.documentsExpired.whyTemplate":
    "इसके बदलने तक नई एंक्वायरी नहीं आएंगी: {kinds}। आपने जो काम पहले ही लिया है उस पर असर नहीं पड़ेगा।",
  "me.capability.plan.documentsExpired.action": "इसे बदलें",
  "me.capability.plan.documents.title": "आपका ID और एड्रेस प्रूफ़",
  "me.capability.plan.documents.why":
    "आपके पहला काम स्वीकार करने से पहले पूछा जाता है, ताकि कस्टमर को पता हो कौन आ रहा है। काम देखने से पहले नहीं।",
  "me.capability.plan.documents.action": "अपने दस्तावेज़ जोड़ें",
  "me.capability.plan.documentExpiry.title": "एक दस्तावेज़ जल्द समाप्त होगा",
  "me.capability.plan.documentExpiry.why": {
    other: "हमें चाहिए दस्तावेज़ों में से एक {days} दिनों में समाप्त होता है। उससे पहले बदलने से एंक्वायरी आती रहेंगी।",
    one: "हमें चाहिए दस्तावेज़ों में से एक {days} दिन में समाप्त होता है। उससे पहले बदलने से एंक्वायरी आती रहेंगी।",
  },
  "me.capability.plan.documentExpiry.action": "इसे पहले ही बदलें",
  "me.capability.plan.insurance.title": "वर्कर इंश्योरेंस",
  "me.capability.plan.insurance.whyExpired":
    "आपने बताया कवर खत्म हो गया है। यह रिन्यू होने तक वर्कफ़ोर्स एंक्वायरी नहीं आएंगी।",
  "me.capability.plan.insurance.whyRequired":
    "आप लोगों को किसी और की जगह पर भेज रहे हैं। वहाँ उन्हें कुछ हो जाए तो कौन कवर करेगा यह हमें इस काम के स्वीकृत होने से पहले जानना है।",
  "me.capability.plan.insurance.whyDefault":
    "जब आप लोगों को कस्टमर की जगह पर भेजने वाले काम के लिए अप्लाई करते हैं तब पूछा जाता है।",
  "me.capability.plan.insurance.action": "अपना कवर बताएं",
  "me.capability.plan.gate.kyc.title": "पहचान जाँच",
  "me.capability.plan.gate.payout.title": "पैसा कहाँ जाता है",
  "me.capability.plan.gate.crew.title": "आप किसे भेजते हैं",
  "me.capability.plan.done": "हो गया।",
  "me.capability.plan.loading": "आपको अभी क्या चाहिए यह पता किया जा रहा है",
  "me.capability.plan.nowHeading": {
    other: "{count} काम करने हैं",
    one: "एक काम करना है",
  },
  "me.capability.plan.nothingNeededTitle": "आपसे कुछ नहीं चाहिए",
  "me.capability.plan.nothingNeededCompleteBody":
    "हमने जो माँगा सब फ़ाइल में है। एंक्वायरी आते ही आपके पास पहुँचेंगी।",
  "me.capability.plan.nothingNeededPendingBody":
    "अभी आपके लिए कुछ रुका नहीं है। नीचे दी गई चीज़ें हम उस समय पूछेंगे जब वे ज़रूरी होंगी।",
  "me.capability.plan.laterHeading": "यह हम बाद में पूछेंगे",
  "me.capability.plan.doneHeading": "पहले से हो गया ({count})",

  "me.capability.screen.specialistWork.title": "स्पेशलिस्ट काम",
  "me.capability.screen.specialistWork.description":
    "दिन के हिसाब से टीम देना, या पूरे प्रोजेक्ट के लिए कोट करना, सामान्य काम से अलग रिव्यू होता है। पूछने में कोई खर्च नहीं है और इससे आपका मौजूदा काम प्रभावित नहीं होता।",
  "me.capability.screen.whereRequestsStand": "आपके अनुरोध कहाँ खड़े हैं",
  "me.capability.screen.askToBeApproved": "स्वीकृति के लिए पूछें",
  "me.capability.screen.howYouWork.title": "आप कैसे काम करते हैं",
  "me.capability.screen.howYouWork.description":
    "यह तय करता है कौन साइन करता है, कौन ज़िम्मेदार है और कस्टमर किसे भुगतान करता है। हम इसे आपकी सेवाओं से कभी नहीं निकालते।",
  "me.capability.screen.loadingDetails": "आपकी जानकारी लोड हो रही है…",
  "me.capability.screen.loadOptionsErrorTitle": "हम विकल्प लोड नहीं कर सके",
  "me.capability.screen.loadOptionsErrorMessage":
    "आपने जो भी डाला है वह कहीं नहीं गया। अपना कनेक्शन देखें और फिर से कोशिश करें।",
  "me.capability.business.legalNameLabel": "रजिस्टर किया हुआ बिज़नेस नाम",
  "me.capability.business.legalNameDescription": "अगर आपके पास है, ठीक वैसा जैसा आपके रजिस्ट्रेशन पर है।",
  "me.capability.business.registrationNumberLabel": "रजिस्ट्रेशन नंबर",
  "me.capability.business.gstRegisteredLabel": "मैं GST रजिस्टर्ड हूं",
  "me.capability.business.gstinLabel": "GSTIN",
  "me.capability.business.yearsInOperationLabel": "काम करने के साल",
  "me.capability.business.expectedNameHint":
    "एजेंसी या वेंडर से आम तौर पर एक रजिस्टर किया हुआ बिज़नेस नाम माँगा जाता है। आप बिना इसके सेव करके बाद में जोड़ सकते हैं।",
  "me.capability.business.saveErrorTitle": "हम इसे सेव नहीं कर सके",
  "me.capability.business.saved": "सेव हो गया।",
  "me.capability.backToSpecialistWork": "स्पेशलिस्ट काम पर वापस जाएं",
  "me.capability.screen.insurance.title": "वर्कर इंश्योरेंस",
  "me.capability.screen.insurance.description":
    "वर्कफ़ोर्स क्षमताएं स्वीकृत होने से पहले ज़रूरी है। ऑपरेशंस इसकी जाँच करता है — तब तक यह एक घोषणा है, वह कवर नहीं जिसके पीछे हम खड़े हैं।",
  "me.capability.screen.loadingDeclaration": "आपकी घोषणा लोड हो रही है…",
  "me.capability.screen.loadDeclarationErrorTitle": "हम आपकी घोषणा लोड नहीं कर सके",
  "me.capability.screen.demand.title": "आपके पास का काम",
  "me.capability.screen.demand.description":
    "आपके चुने इलाकों में कस्टमर के लाइव अनुरोध। कोई कस्टमर आपको इनवाइट करने तक नाम, फ़ोन नंबर और असली पता छुपे रहते हैं।",
  "me.capability.screen.demand.finishStepsTitle": "काम देखने के लिए ऊपर के स्टेप पूरे करें",
  "me.capability.screen.demand.finishStepsBody":
    "हम अनुरोधों को आपकी बताई सेवा और शहर से मिलाते हैं। दोनों मिलने तक यहाँ दिखाने के लिए कुछ सही नहीं है।",

  "me.capability.businessChoice.legend": "आप कैसे काम करते हैं?",
  "me.capability.businessChoice.description":
    "यह तय करता है कि आपको कौन भुगतान करता है और टैक्स कैसे संभाला जाता है। आप इसे बाद में बदल सकते हैं।",

  "me.capability.picker.loading": "आप जिस काम के लिए अप्लाई कर सकते हैं वह लोड हो रहा है",
  "me.capability.picker.emptyTitle": "अभी अप्लाई करने के लिए कुछ नहीं है",
  "me.capability.picker.emptyDescription":
    "आपने चुनी सेवाएं वर्कफ़ोर्स या प्रोजेक्ट वेंडर के लिए खुली नहीं हैं। “आपका काम” पर एक और सेवा जोड़ने से एक खुल सकती है।",
  "me.capability.picker.alreadyAsked": "पहले ही पूछा गया",
  "me.capability.picker.platformPaidNote": "कस्टमर के स्वीकृत करने तक Vsolve भुगतान के हर चरण को रखता है।",
  "me.capability.picker.directPaidNote": "कस्टमर सीधे आपको भुगतान करता है।",
  "me.capability.picker.insuranceNote": "यह स्वीकृत होने से पहले आपसे वर्कर इंश्योरेंस के लिए पूछा जाएगा।",
  "me.capability.picker.alreadyRequestedNote":
    "इसके लिए आपका एक लाइव अनुरोध है। इसकी प्रगति आपकी क्षमताओं की लिस्ट में है।",
  "me.capability.picker.unsupportedPrefix": "यह सेवा कुछ ऐसा पूछती है जो आपका ऐप अभी नहीं दिखा सकता",
  "me.capability.picker.unsupportedSuffix": "ऐप अपडेट करें, या जवाब दर्ज करने के लिए सपोर्ट से पूछें।",
  "me.capability.picker.sendingRequest": "आपका अनुरोध भेजा जा रहा है",
  "me.capability.picker.submitButton": "स्वीकृति के लिए पूछें",
  "me.capability.picker.reviewNote":
    "यह ऑन होने से पहले हम इसकी समीक्षा करते हैं। एक स्किल चुनना खुद से यह काम नहीं खोलता।",
  "me.capability.picker.chooseOne": "एक चुनें",

  "me.capability.statusList.loading": "आप किसके लिए स्वीकृत हैं वह लोड हो रहा है",
  "me.capability.statusList.emptyTitle": "आपने अभी किसी स्पेशलिस्ट काम के लिए नहीं पूछा",
  "me.capability.statusList.emptyDescription":
    "वर्कफ़ोर्स और प्रोजेक्ट काम ऑन होने से पहले स्वीकृति चाहिए। आपके खाते में बाकी सब आज जैसे ही काम करता है।",
  "me.capability.statusList.decidedLabel": "फ़ैसला हुआ",
  "me.capability.statusList.referenceSuffix": " · संदर्भ {code}",

  "me.capability.demand.loading": "आपके पास का काम लोड हो रहा है",
  "me.capability.demand.ineligibleNotice":
    "यह आपके पास माँगा जा रहा असली काम है। जवाब देने से पहले आपको इन सेवाओं के लिए स्वीकृति चाहिए — हर कार्ड बताता है कौन सी।",
  "me.capability.demand.privacyNote":
    "कोई कस्टमर आपको इनवाइट करने तक नाम, फ़ोन नंबर और असली पता छुपे रहते हैं।",
  "me.capability.demand.emptyNoMatchTitle": "अभी आपकी सेवाओं से कुछ नहीं मिला",
  "me.capability.demand.emptyNoMatchDescription":
    "आपने हमें एक काम और एक जगह बताई है। किसी एक को और जोड़ने से आपके पास पहुँचने वाला काम बढ़ता है।",
  "me.capability.demand.emptyNoneNearbyTitle": "अभी आपके इलाके में कुछ नहीं है",
  "me.capability.demand.emptyNoneNearbyDescription":
    "काम दिन भर आता है। आपके काम से मिलने वाला कुछ आने पर हम आपको मेसेज करेंगे।",
  "me.capability.demand.noStartDate": "अभी शुरुआत की तारीख नहीं दी गई",
  "me.capability.demand.startsLabel": "शुरू होता है",
  "me.capability.demand.eligibleNote": "आपको इसके लिए इनवाइट किया जा सकता है।",
  "me.capability.demand.ineligibleFallbackHint": "आप अभी इस तरह के काम के लिए स्वीकृत नहीं हैं।",

  "me.capability.express.title": "काम लेना शुरू करें",
  "me.capability.express.readyBody": "आप तैयार हैं। आपके पास के लोग यही माँग रहे हैं।",
  "me.capability.express.stepsRemainingTemplate": "चार छोटे स्टेप। {remaining} बाकी हैं।",
  "me.capability.express.ariaStepsProgress": "सेटअप स्टेप, {total} में से {done} पूरे",
  "me.capability.express.srDone": "पूरा हुआ",
  "me.capability.express.srNotDone": "अभी पूरा नहीं हुआ",
  "me.capability.express.seeWhatPeopleNeed": "देखें लोगों को क्या चाहिए",
  "me.capability.express.documentsLaterNote":
    "आपके पहला काम स्वीकार करने पर हम दस्तावेज़ों के लिए पूछेंगे — अभी नहीं।",
  "me.capability.express.step.phone.label": "आपका नंबर",
  "me.capability.express.step.phone.ask": "हम आपको एक कोड टेक्स्ट करेंगे। कोई पासवर्ड याद नहीं रखना।",
  "me.capability.express.step.identity.label": "आपका नाम",
  "me.capability.express.step.identity.ask":
    "कस्टमर को क्या दिखेगा, और आप अकेले काम करते हैं या टीम चलाते हैं।",
  "me.capability.express.step.service.label": "एक सेवा",
  "me.capability.express.step.service.ask": "वह एक काम चुनें जो आप करते हैं। बाद में और जोड़ सकते हैं।",
  "me.capability.express.step.area.label": "एक शहर",
  "me.capability.express.step.area.ask": "वह जगह जहाँ आप काम चाहते हैं। बाद में और जोड़ सकते हैं।",

  "me.capability.gateNotice.heading": "आपके {action} करने से पहले एक बात",

  "me.capability.insuranceForm.intro":
    "आप लोगों को किसी और की जगह पर भेज रहे हैं। वहाँ कुछ गलत होने पर उन्हें कौन कवर करता है, यह यही है।",
  "me.capability.insuranceForm.insurerLabel": "इंश्योरर",
  "me.capability.insuranceForm.policyNumberLabel": "पॉलिसी नंबर",
  "me.capability.insuranceForm.policyNumberDescription": "ठीक वैसा जैसा दस्तावेज़ पर है।",
  "me.capability.insuranceForm.amountCoveredLabel": "कवर की गई राशि (₹)",
  "me.capability.insuranceForm.coverStartsLabel": "कवर शुरू होता है",
  "me.capability.insuranceForm.coverEndsLabel": "कवर खत्म होता है",
  "me.capability.insuranceForm.wcLabel": "इस पॉलिसी में वर्कमेन्स कम्पेंसेशन शामिल है।",
  "me.capability.insuranceForm.wcHelp": "कुछ निर्माण और औद्योगिक काम इसके बिना स्वीकृत नहीं हो सकते।",
  "me.capability.insuranceForm.updateButton": "घोषणा अपडेट करें",
  "me.capability.insuranceForm.saveButton": "घोषणा सेव करें",
  "me.capability.insuranceForm.footerNote":
    "वर्कफ़ोर्स क्षमताओं को स्वीकृत करने से पहले हम इसकी जाँच करते हैं। कवर होने का झूठा दावा सस्पेंशन का कारण बनता है।",
  "me.capability.insuranceForm.checkedBadge": "जाँचा गया",
  "me.capability.insuranceForm.notCheckedBadge": "अभी तक नहीं जाँचा",
  "me.capability.insuranceForm.expiredBadge": "समय सीमा समाप्त",
  "me.capability.insuranceForm.endingSoonBadge": "जल्द खत्म होगा",
  "me.capability.insuranceForm.coverLabel": "कवर",
  "me.capability.insuranceForm.coverCaption": "{insurer} · {validTo} तक",
  "me.capability.insuranceForm.expiredNote":
    "यह कवर खत्म हो गया है। रिन्यू होने तक वर्कफ़ोर्स एंक्वायरी नहीं आएंगी।",
  "me.capability.insuranceForm.endingSoonTemplate": {
    other: "{days} दिनों में खत्म होगा। काम में रुकावट न आए इसके लिए इससे पहले रिन्यू करें।",
    one: "{days} दिन में खत्म होगा। काम में रुकावट न आए इसके लिए इससे पहले रिन्यू करें।",
  },
};

export const catalogsByLocale: Record<Locale, Catalog> = {
  "en-IN": en,
  "te-IN": te,
  "hi-IN": hi,
};
