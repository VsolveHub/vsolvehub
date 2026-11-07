// scripts/qa/apply-phase5-catalogs.mjs
import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const webDir = path.resolve(rootDir, "frontend/apps/partner/i18n/catalogs");
const mobileDir = path.resolve(rootDir, "frontend/mobile/apps/partner/src/i18n/catalogs");

const WORK_KEYS = {
  en: {
    "work.dispatch.loading": "Loading job offer details...",
    "work.dispatch.unableToLoad": "Unable to load dispatch offer",
    "work.dispatch.notFound": "Offer not found or unavailable.",
    "work.dispatch.backToDashboard": "Back to Dashboard",
    "work.dispatch.instantBadge": "Instant / ASAP Booking",
    "work.dispatch.offerNumber": "Offer #{id}",
    "work.dispatch.countdownTitle": "Offer Expiry Countdown",
    "work.dispatch.expiringSoon": "Expiring very soon! Accept now to take this booking.",
    "work.dispatch.respondBeforeExpiry": "Respond before the timer expires to secure this job.",
    "work.dispatch.windowClosed": "This offer time window has closed.",
    "work.dispatch.expired": "This offer has expired.",
    "work.dispatch.alreadyAccepted": "You have already accepted this booking.",
    "work.dispatch.declined": "You declined this offer. Reassigning to another partner...",
    "work.dispatch.acceptedSuccess": "Offer accepted! Booking confirmed.",
    "work.dispatch.redirecting": "Redirecting you to the active job screen...",
    "work.dispatch.acceptFailed": "Failed to accept offer.",
    "work.dispatch.declineFailed": "Failed to decline offer.",
    "work.dispatch.defaultCategory": "Service Category",
    "work.dispatch.defaultTitle": "Instant Service Request",
    "work.dispatch.estimatedDuration": "Estimated Duration",
    "work.dispatch.durationMinutes": "{count} Minutes",
    "work.dispatch.serviceArea": "Service Area",
    "work.dispatch.privacyNotice": "Customer details and full service address are released immediately upon accepting this dispatch offer.",
    "work.dispatch.acceptAction": "Accept Job Offer",
    "work.dispatch.accepting": "Accepting Job...",
    "work.dispatch.declineAction": "Decline",
    "work.dispatch.declining": "Declining...",
    "work.dispatch.viewActiveJobs": "View Active Jobs",
  },
  te: {
    "work.dispatch.loading": "పని ఆఫర్ వివరాలను లోడ్ చేస్తోంది...",
    "work.dispatch.unableToLoad": "డిస్పాచ్ ఆఫర్‌ను లోడ్ చేయడం సాధ్యం కాలేదు",
    "work.dispatch.notFound": "ఆఫర్ కనుగొనబడలేదు లేదా అందుబాటులో లేదు.",
    "work.dispatch.backToDashboard": "డ్యాష్‌బోర్డ్‌కు తిరిగి వెళ్ళండి",
    "work.dispatch.instantBadge": "తక్షణ / ASAP బుకింగ్",
    "work.dispatch.offerNumber": "ఆఫర్ #{id}",
    "work.dispatch.countdownTitle": "ఆఫర్ గడువు కౌంట్‌డౌన్",
    "work.dispatch.expiringSoon": "త్వరలోనే గడువు ముగుస్తుంది! ఈ బుకింగ్ తీసుకోవడానికి ఇప్పుడే ఆమోదించండి.",
    "work.dispatch.respondBeforeExpiry": "ఈ పనిని పొందడానికి టైమర్ ముగిసేలోపు స్పందించండి.",
    "work.dispatch.windowClosed": "ఈ ఆఫర్ సమయ వ్యవధి ముగిసింది.",
    "work.dispatch.expired": "ఈ ఆఫర్ గడువు ముగిసింది.",
    "work.dispatch.alreadyAccepted": "మీరు ఇప్పటికే ఈ బుకింగ్‌ను ఆమోదించారు.",
    "work.dispatch.declined": "మీరు ఈ ఆఫర్‌ను తిరస్కరించారు. మరొక భాగస్వామికి కేటాయిస్తున్నాం...",
    "work.dispatch.acceptedSuccess": "ఆఫర్ ఆమోదించబడింది! బుకింగ్ నిర్ధారించబడింది.",
    "work.dispatch.redirecting": "యాక్టివ్ జాబ్ స్క్రీన్‌కు తీసుకెళ్తున్నాం...",
    "work.dispatch.acceptFailed": "ఆఫర్‌ను ఆమోదించడం విఫలమైంది.",
    "work.dispatch.declineFailed": "ఆఫర్‌ను తిరస్కరించడం విఫలమైంది.",
    "work.dispatch.defaultCategory": "సేవా వర్గం",
    "work.dispatch.defaultTitle": "తక్షణ సేవా అభ్యర్థన",
    "work.dispatch.estimatedDuration": "అంచనా సమయం",
    "work.dispatch.durationMinutes": "{count} నిమిషాలు",
    "work.dispatch.serviceArea": "సేవా ప్రాంతం",
    "work.dispatch.privacyNotice": "ఈ డిస్పాచ్ ఆఫర్‌ను ఆమోదించిన వెంటనే కస్టమర్ వివరాలు మరియు పూర్తి సేవా చిరునామా విడుదల చేయబడతాయి.",
    "work.dispatch.acceptAction": "జాబ్ ఆఫర్‌ను ఆమోదించండి",
    "work.dispatch.accepting": "పనిని ఆమోదిస్తోంది...",
    "work.dispatch.declineAction": "తిరస్కరించు",
    "work.dispatch.declining": "తిరస్కరిస్తోంది...",
    "work.dispatch.viewActiveJobs": "యాక్టివ్ పనులను చూడండి",
  },
  hi: {
    "work.dispatch.loading": "काम के ऑफर का विवरण लोड हो रहा है...",
    "work.dispatch.unableToLoad": "डिस्पैच ऑफर लोड करने में असमर्थ",
    "work.dispatch.notFound": "ऑफर नहीं मिला या अनुपलब्ध है।",
    "work.dispatch.backToDashboard": "डैशबोर्ड पर वापस जाएं",
    "work.dispatch.instantBadge": "तत्काल / ASAP बुकिंग",
    "work.dispatch.offerNumber": "ऑफर #{id}",
    "work.dispatch.countdownTitle": "ऑफर समाप्ति उलटी गिनती",
    "work.dispatch.expiringSoon": "बहुत जल्द समाप्त हो रहा है! यह बुकिंग लेने के लिए अभी स्वीकार करें।",
    "work.dispatch.respondBeforeExpiry": "यह काम सुरक्षित करने के लिए टाइमर समाप्त होने से पहले जवाब दें।",
    "work.dispatch.windowClosed": "इस ऑफर की समय सीमा समाप्त हो गई है।",
    "work.dispatch.expired": "यह ऑफर समाप्त हो चुका है।",
    "work.dispatch.alreadyAccepted": "आप पहले ही इस बुकिंग को स्वीकार कर चुके हैं।",
    "work.dispatch.declined": "आपने यह ऑफर अस्वीकार कर दिया। किसी अन्य साथी को सौंपा जा रहा है...",
    "work.dispatch.acceptedSuccess": "ऑफर स्वीकार किया गया! बुकिंग पक्की हो गई।",
    "work.dispatch.redirecting": "सक्रिय कार्य स्क्रीन पर ले जाया जा रहा है...",
    "work.dispatch.acceptFailed": "ऑफर स्वीकार करने में विफल।",
    "work.dispatch.declineFailed": "ऑफर अस्वीकार करने में विफल।",
    "work.dispatch.defaultCategory": "सेवा श्रेणी",
    "work.dispatch.defaultTitle": "तत्काल सेवा अनुरोध",
    "work.dispatch.estimatedDuration": "अनुमानित अवधि",
    "work.dispatch.durationMinutes": "{count} मिनट",
    "work.dispatch.serviceArea": "सेवा क्षेत्र",
    "work.dispatch.privacyNotice": "इस डिस्पैच ऑफर को स्वीकार करते ही ग्राहक विवरण और पूरा सेवा पता तुरंत जारी कर दिया जाता है।",
    "work.dispatch.acceptAction": "काम का ऑफर स्वीकार करें",
    "work.dispatch.accepting": "काम स्वीकार किया जा रहा है...",
    "work.dispatch.declineAction": "अस्वीकार करें",
    "work.dispatch.declining": "अस्वीकार किया जा रहा है...",
    "work.dispatch.viewActiveJobs": "सक्रिय काम देखें",
  },
};

const MONEY_KEYS = {
  en: {
    "money.withdraw.step.requested": "Requested",
    "money.withdraw.step.sent": "Sent to bank",
    "money.withdraw.step.paid": "Paid",
    "money.withdraw.step.failed": "Failed",
    "money.withdraw.heading": "Withdraw Ready Balance",
    "money.withdraw.subheading": "Your whole ready balance goes to your verified bank account in one transfer.",
    "money.withdraw.checking": "Checking what you can withdraw…",
    "money.withdraw.action": "Withdraw",
    "money.withdraw.actionAmount": "Withdraw {amount}",
    "money.withdraw.sending": "Sending…",
    "money.withdraw.feeNote": "{amount} less a {fee} fee for an extra withdrawal this week.",
    "money.withdraw.freeNote": "Free. One withdrawal a week is on us.",
    "money.withdraw.reviewNote": "Our team checks this one before it is sent. Your money is set aside for it.",
    "money.withdraw.bankRef": "Bank reference: {utr}",
    "money.withdraw.afterFee": "after {fee} fee",
    "money.withdraw.toAccount": "to ••••{last4}",
    "money.withdraw.recent": "Recent Withdrawals",
    "money.withdraw.coolingFrom": "You can withdraw from {date}.",
    "money.withdraw.failureSafety": "{failure} If money was set aside, it shows below — tapping again will not withdraw twice.",
    "money.payout.coolingNote": "Payouts become withdrawable automatically after the 24-hour hold.",
    "money.payout.sheetDescription": "Direct deposit for all your completed bookings and instant jobs.",
    "money.payout.error.holderNameRequired": "Account holder name is required",
    "money.payout.error.accountNumberRequired": "Account number is required",
    "money.payout.error.accountNumberDigits": "Account number must be between 9 and 18 digits",
    "money.payout.error.accountNumberMismatch": "Account numbers do not match",
    "money.payout.error.ifscRequired": "IFSC code is required",
    "money.payout.error.ifscInvalid": "Enter a valid 11-character IFSC (e.g. SBIN0001234)",
    "money.payout.field.accountNumberPlaceholder": "9 to 18 digits",
    "money.payout.field.confirmAccountNumberPlaceholder": "Re-enter bank account number",
    "money.withdraw.confirmTitle": "Send {amount} to your bank?",
    "money.withdraw.confirmBody": "Your ready balance of {amount} will be transferred to your account ending in {last4}.",
    "money.withdraw.confirmFeeNote": "A {fee} fee applies because you have already used this week’s free withdrawal.",
    "money.withdraw.confirmReviewNote": "First payments to a new bank account undergo manual security verification. Funds are released once approved.",
    "money.withdraw.confirmInstantNote": "Transfer initiated via IMPS/NEFT, typically credited within minutes.",
    "money.withdraw.confirmRejectNote": "If rejected by your bank, funds return automatically to your balance.",
  },
  te: {
    "money.withdraw.step.requested": "అభ్యర్థించబడింది",
    "money.withdraw.step.sent": "బ్యాంకుకు పంపబడింది",
    "money.withdraw.step.paid": "చెల్లించబడింది",
    "money.withdraw.step.failed": "విఫలమైంది",
    "money.withdraw.heading": "రెడీ బ్యాలెన్స్ విత్‌డ్రా చేసుకోండి",
    "money.withdraw.subheading": "మీ పూర్తి రెడీ బ్యాలెన్స్ ఒకే బదిలీలో మీ ధృవీకరించబడిన బ్యాంక్ ఖాతాకు చేరుతుంది.",
    "money.withdraw.checking": "మీరు ఎంత విత్‌డ్రా చేసుకోగలరో చూస్తోంది…",
    "money.withdraw.action": "విత్‌డ్రా",
    "money.withdraw.actionAmount": "{amount} విత్‌డ్రా చేయండి",
    "money.withdraw.sending": "పంపుతోంది…",
    "money.withdraw.feeNote": "ఈ వారం అదనపు విత్‌డ్రా కోసం {fee} రుసుము తీసివేయగా {amount}.",
    "money.withdraw.freeNote": "ఉచితం. వారానికి ఒక విత్‌డ్రా ఉచితంగా లభిస్తుంది.",
    "money.withdraw.reviewNote": "దీన్ని పంపే ముందు మా బృందం పరిశీలిస్తుంది. మీ డబ్బు దీని కోసం భద్రపరచబడింది.",
    "money.withdraw.bankRef": "బ్యాంక్ రిఫరెన్స్: {utr}",
    "money.withdraw.afterFee": "{fee} ఫీజు తర్వాత",
    "money.withdraw.toAccount": "••••{last4} కు",
    "money.withdraw.recent": "ఇటీవలి విత్‌డ్రాలు",
    "money.withdraw.coolingFrom": "మీరు {date} నుండి విత్‌డ్రా చేసుకోవచ్చు.",
    "money.withdraw.failureSafety": "{failure} డబ్బు కేటాయించబడి ఉంటే, అది కింద కనిపిస్తుంది — మళ్లీ నొక్కినా రెండుసార్లు విత్‌డ్రా కాదు.",
    "money.payout.coolingNote": "24 గంటల హోల్డ్ తర్వాత చెల్లింపులు ఆటోమేటిక్‌గా విత్‌డ్రా చేసుకోవడానికి వీలవుతాయి.",
    "money.payout.sheetDescription": "మీరు పూర్తి చేసిన అన్ని బుకింగ్‌లు మరియు తక్షణ పనుల కోసం ప్రత్యక్ష డిపాజిట్.",
    "money.payout.error.holderNameRequired": "ఖాతాదారుని పేరు తప్పనిసరి",
    "money.payout.error.accountNumberRequired": "ఖాతా నంబర్ తప్పనిసరి",
    "money.payout.error.accountNumberDigits": "ఖాతా సంఖ్య 9 నుండి 18 అంకెల మధ్య ఉండాలి",
    "money.payout.error.accountNumberMismatch": "ఖాతా సంఖ్యలు సరిపోలడం లేదు",
    "money.payout.error.ifscRequired": "IFSC కోడ్ తప్పనిసరి",
    "money.payout.error.ifscInvalid": "సరైన 11 అక్షరాల IFSC కోడ్‌ను నమోదు చేయండి (ఉదా. SBIN0001234)",
    "money.payout.field.accountNumberPlaceholder": "9 నుండి 18 అంకెలు",
    "money.payout.field.confirmAccountNumberPlaceholder": "బ్యాంక్ ఖాతా సంఖ్యను మళ్లీ నమోదు చేయండి",
    "money.withdraw.confirmTitle": "మీ బ్యాంకుకు {amount} పంపించాలా?",
    "money.withdraw.confirmBody": "మీ రెడీ బ్యాలెన్స్ {amount} మీ {last4} తో ముగిసే ఖాతాకు బదిలీ చేయబడుతుంది.",
    "money.withdraw.confirmFeeNote": "ఈ వారం ఉచిత విత్‌డ్రాను మీరు ఇప్పటికే ఉపయోగించినందున {fee} రుసుము వర్తిస్తుంది.",
    "money.withdraw.confirmReviewNote": "కొత్త బ్యాంక్ ఖాతాకు మొదటి చెల్లింపులు మాన్యువల్ భద్రతా పరిశీలనకు లోనవుతాయి. ఆమోదించబడిన తర్వాత నిధులు విడుదల చేయబడతాయి.",
    "money.withdraw.confirmInstantNote": "IMPS/NEFT ద్వారా బదిలీ ప్రారంభించబడింది, సాధారణంగా కొద్ది నిమిషాల్లో జమ అవుతుంది.",
    "money.withdraw.confirmRejectNote": "మీ బ్యాంక్ తిరస్కరిస్తే, నిధులు ఆటోమేటిక్‌గా మీ బ్యాలెన్స్‌కు తిరిగి వస్తాయి.",
  },
  hi: {
    "money.withdraw.step.requested": "अनुरोधित",
    "money.withdraw.step.sent": "बैंक को भेजा गया",
    "money.withdraw.step.paid": "भुगतान हो गया",
    "money.withdraw.step.failed": "विफल",
    "money.withdraw.heading": "तैयार शेष राशि निकालें",
    "money.withdraw.subheading": "आपकी पूरी तैयार शेष राशि एक ही ट्रांसफर में आपके सत्यापित बैंक खाते में चली जाती है।",
    "money.withdraw.checking": "जांच की जा रही है कि आप कितनी राशि निकाल सकते हैं…",
    "money.withdraw.action": "निकासी",
    "money.withdraw.actionAmount": "{amount} निकालें",
    "money.withdraw.sending": "भेजा जा रहा है…",
    "money.withdraw.feeNote": "इस सप्ताह अतिरिक्त निकासी के लिए {fee} शुल्क घटाकर {amount}।",
    "money.withdraw.freeNote": "मुफ़्त। सप्ताह में एक निकासी हमारी ओर से मुफ़्त है।",
    "money.withdraw.reviewNote": "भेजने से पहले हमारी टीम इसकी जांच करती है। आपके पैसे इसके लिए अलग रखे गए हैं।",
    "money.withdraw.bankRef": "बैंक संदर्भ: {utr}",
    "money.withdraw.afterFee": "{fee} शुल्क के बाद",
    "money.withdraw.toAccount": "••••{last4} में",
    "money.withdraw.recent": "हाल की निकासी",
    "money.withdraw.coolingFrom": "आप {date} से निकासी कर सकते हैं।",
    "money.withdraw.failureSafety": "{failure} यदि पैसे अलग रखे गए थे, तो यह नीचे दिखेगा — दोबारा दबाने से दो बार निकासी नहीं होगी।",
    "money.payout.coolingNote": "24 घंटे की रोक के बाद भुगतान अपने आप निकासी योग्य हो जाता है।",
    "money.payout.sheetDescription": "आपकी सभी पूर्ण बुकिंग और तत्काल नौकरियों के लिए प्रत्यक्ष जमा।",
    "money.payout.error.holderNameRequired": "खाताधारक का नाम आवश्यक है",
    "money.payout.error.accountNumberRequired": "खाता संख्या आवश्यक है",
    "money.payout.error.accountNumberDigits": "खाता संख्या 9 से 18 अंकों के बीच होनी चाहिए",
    "money.payout.error.accountNumberMismatch": "खाता संख्या मेल नहीं खाती",
    "money.payout.error.ifscRequired": "IFSC कोड आवश्यक है",
    "money.payout.error.ifscInvalid": "मान्य 11-वर्ण का IFSC दर्ज करें (उदा. SBIN0001234)",
    "money.payout.field.accountNumberPlaceholder": "9 से 18 अंक",
    "money.payout.field.confirmAccountNumberPlaceholder": "बैंक खाता संख्या पुनः दर्ज करें",
    "money.withdraw.confirmTitle": "क्या आपके बैंक में {amount} भेजें?",
    "money.withdraw.confirmBody": "आपकी तैयार शेष राशि {amount} आपके खाते के अंतिम 4 अंक {last4} में स्थानांतरित कर दी जाएगी।",
    "money.withdraw.confirmFeeNote": "{fee} शुल्क लागू होता है क्योंकि आपने इस सप्ताह की मुफ़्त निकासी पहले ही उपयोग कर ली है।",
    "money.withdraw.confirmReviewNote": "नए बैंक खाते में पहले भुगतान का मैन्युअल सुरक्षा सत्यापन होता है। स्वीकृत होने के बाद राशि जारी की जाती है।",
    "money.withdraw.confirmInstantNote": "IMPS/NEFT के माध्यम से ट्रांसफर शुरू किया गया, आमतौर पर कुछ ही मिनटों में जमा हो जाता है।",
    "money.withdraw.confirmRejectNote": "यदि आपके बैंक द्वारा अस्वीकार कर दिया जाता है, तो धन स्वचालित रूप से आपके शेष में वापस आ जाता है।",
  },
};

const RENTALS_KEYS = {
  en: {
    "rentals.hours.open": "OPEN",
    "rentals.hours.dateFormatError": "Enter date as YYYY-MM-DD",
    "rentals.hours.daysOffHeading": "Days off / Holidays",
    "rentals.hours.daysOffHelp": "Add specific dates when your store is closed.",
    "rentals.delivery.statusUpdated": "Transport status updated.",
    "rentals.delivery.actionFailed": "Transport action failed",
  },
  te: {
    "rentals.hours.open": "తెరిచి ఉంది",
    "rentals.hours.dateFormatError": "తేదీని YYYY-MM-DD రూపంలో నమోదు చేయండి",
    "rentals.hours.daysOffHeading": "సెలవు దినాలు",
    "rentals.hours.daysOffHelp": "మీ దుకాణం మూసివేయబడే నిర్దిష్ట తేదీలను జోడించండి.",
    "rentals.delivery.statusUpdated": "రవాణా స్థితి నవీకరించబడింది.",
    "rentals.delivery.actionFailed": "రవాణా చర్య విఫలమైంది",
  },
  hi: {
    "rentals.hours.open": "खुला है",
    "rentals.hours.dateFormatError": "तारीख YYYY-MM-DD के रूप में दर्ज करें",
    "rentals.hours.daysOffHeading": "छुट्टियां",
    "rentals.hours.daysOffHelp": "अपनी दुकान बंद रहने की विशिष्ट तिथियां जोड़ें।",
    "rentals.delivery.statusUpdated": "परिवहन स्थिति अपडेट की गई।",
    "rentals.delivery.actionFailed": "परिवहन कार्रवाई विफल रही",
  },
};

const STAYS_KEYS = {
  en: {
    "stays.addRoom.errorUnexpected": "An unexpected error occurred.",
  },
  te: {
    "stays.addRoom.errorUnexpected": "అనుకోని లోపం జరిగింది.",
  },
  hi: {
    "stays.addRoom.errorUnexpected": "एक अप्रत्याशित त्रुटि हुई।",
  },
};

function injectKeysIntoCatalog(filePath, keyDict) {
  if (!fs.existsSync(filePath)) {
    console.error(`File does not exist: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, "utf-8");

  for (const loc of ["en", "te", "hi"]) {
    const keys = keyDict[loc];
    if (!keys) continue;

    // Find the end of `const {loc}: Catalog = { ... };`
    const pattern = new RegExp(`const\\s+${loc}\\s*:\\s*Catalog\\s*=\\s*\\{`, "g");
    const match = pattern.exec(content);
    if (!match) {
      console.error(`Could not find const ${loc} in ${filePath}`);
      continue;
    }

    let depth = 1;
    let idx = match.index + match[0].length;
    let endIdx = -1;
    while (idx < content.length && depth > 0) {
      if (content[idx] === "{") depth++;
      else if (content[idx] === "}") {
        depth--;
        if (depth === 0) {
          endIdx = idx;
          break;
        }
      }
      idx++;
    }

    if (endIdx === -1) {
      console.error(`Could not find matching closing brace for ${loc} in ${filePath}`);
      continue;
    }

    // Format lines to insert
    const linesToInsert = [];
    for (const [k, v] of Object.entries(keys)) {
      // Check if key already present in block
      const block = content.slice(match.index, endIdx);
      if (block.includes(`"${k}":`) || block.includes(`'${k}':`)) {
        continue;
      }
      const valStr = typeof v === "object" ? JSON.stringify(v) : JSON.stringify(v);
      linesToInsert.push(`  "${k}": ${valStr},`);
    }

    if (linesToInsert.length > 0) {
      const insertion = "\n" + linesToInsert.join("\n") + "\n";
      content = content.slice(0, endIdx) + insertion + content.slice(endIdx);
    }
  }

  fs.writeFileSync(filePath, content, "utf-8");
  console.log(`Updated catalog: ${filePath}`);
}

const updates = [
  { fileName: "work.ts", keys: WORK_KEYS },
  { fileName: "money.ts", keys: MONEY_KEYS },
  { fileName: "rentals.ts", keys: RENTALS_KEYS },
  { fileName: "stays.ts", keys: STAYS_KEYS },
];

for (const up of updates) {
  injectKeysIntoCatalog(path.join(webDir, up.fileName), up.keys);
  injectKeysIntoCatalog(path.join(mobileDir, up.fileName), up.keys);
}

console.log("Catalogs updated successfully.");
