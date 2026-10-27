import type { Catalog, Locale } from "@vsolve/ui";

/**
 * `features/notifications/**` (the bell, its panel, and the live booking
 * popups) and `features/presence/**` (going online/offline and its status
 * copy). Two domains in one file because the i18n stub for this slice is
 * singular — see `index.ts`, which merges every domain file regardless of
 * which one supplies a given key.
 */

const en: Catalog = {
  "notifications.bell.ariaLabel.unknown": "Notifications",
  "notifications.bell.ariaLabel.none": "Notifications, nothing unread",
  "notifications.bell.ariaLabel.count": "Notifications, {count} unread",

  "notifications.panel.title": "Notifications",
  "notifications.panel.markAllRead": "Mark all read",
  "notifications.panel.markingAllRead": "Marking everything read",
  "notifications.panel.loading": "Loading your notifications",
  "notifications.panel.empty.title": "Nothing to read yet",
  "notifications.panel.empty.description":
    "Vsolve tells you here when a job is confirmed, when a customer answers, and when money moves. There is nothing you need to do.",
  "notifications.panel.truncated":
    "Only your most recent notices are shown here. Older ones stay on the job they belong to.",
  "notifications.row.unreadSr": "Unread. ",
  "notifications.row.clearTitle": "Clear notification",
  "notifications.row.clearAriaLabel": "Clear notification: {title}",
  "notifications.row.markRead": "Mark read",
  "notifications.row.markReadSr": ": {title}",
  "notifications.row.open": "Open",
  "notifications.row.openSr": ": {title}",
  "notifications.markReadRefusal.notFound.title": "That notice is no longer here",
  "notifications.markReadRefusal.notFound.message":
    "It was read somewhere else, or it has been cleared. Close and re-open this panel to see what is actually waiting.",
  "notifications.markReadRefusal.generic.title": "We could not mark that read",
  "notifications.markReadRefusal.generic.message":
    "Nothing has changed and the notice is still here. Try again in a moment.",

  "notifications.liveBooking.timer.label": "Time to respond",
  "notifications.liveBooking.timer.expired": "This window has closed. The job may have moved on.",
  "notifications.liveBooking.timer.running": "Accept or decline before the timer runs out.",
  "notifications.liveBooking.waitingCount":
    "{count} more waiting — answering this opens the next.",
  "notifications.liveBooking.decline": "Decline",
  "notifications.liveBooking.accept": "Accept",
  "notifications.liveBooking.accepting": "Accepting",
  "notifications.liveBooking.loadingServiceDetails": "Loading service details…",
  "notifications.liveBooking.service": "Service",

  "notifications.offerPopup.title": "New booking request",
  "notifications.offerPopup.description":
    "A customer just booked. Accept to take the job or decline to pass.",
  "notifications.offerPopup.actionNeeded.title": "Action needed now",
  "notifications.offerPopup.actionNeeded.message":
    "This offer expires soon. Another partner may take it if you wait.",
  "notifications.offerPopup.detailsUnavailable":
    "We could not load the service details. You can still accept or decline, or open Work to see the full booking.",
  "notifications.offerPopup.youReceive": "You receive (est.)",
  "notifications.offerPopup.updateError": "Could not update this offer",

  "notifications.fixedVisit.youReceive": "You receive",
  "notifications.fixedVisit.service": "Service",
  "notifications.fixedVisit.area": "Area",
  "notifications.fixedVisit.when": "When",
  "notifications.fixedVisit.onSite": "On site",
  "notifications.fixedVisit.durationMinutes": "{minutes} min",
  "notifications.fixedVisit.note":
    "The customer picked this time. Take it or pass — there is nothing to schedule.",

  "notifications.invitationPopup.description.fixedVisit":
    "A customer booked a visit time near you.",
  "notifications.invitationPopup.description.open":
    "A customer is waiting for your answer. Review the service and respond.",
  "notifications.invitationPopup.decline.fixedVisit": "Pass on this one",
  "notifications.invitationPopup.accepting.fixedVisit": "Taking it",
  "notifications.invitationPopup.accept.fixedVisit": "Take this visit",
  "notifications.invitationPopup.alert.title.fixedVisit": "First to take it gets it",
  "notifications.invitationPopup.alert.title.open": "New customer enquiry",
  "notifications.invitationPopup.alert.message.fixedVisit":
    "This visit was offered to other professionals too. Answer before the timer runs out.",
  "notifications.invitationPopup.alert.message.open":
    "Review the service below and accept to respond, or decline to release the slot.",
  "notifications.invitationPopup.aboutService": "About the service",
  "notifications.invitationPopup.detailsError.title": "Could not load full details",
  "notifications.invitationPopup.detailsError.message":
    "You can still accept or decline below. Open Work for the full enquiry if needed.",
  "notifications.invitationPopup.updateError.enquiry": "Could not update this enquiry",

  "presence.status.checking.label": "Checking",
  "presence.status.checking.detail": "Confirming whether you are still online.",
  "presence.status.offline.label": "Offline",
  "presence.status.offline.detail": "You will not be offered any jobs until you go online.",
  "presence.status.connecting.label": "Going online",
  "presence.status.connecting.detail":
    "Confirming your location with us. You are not receiving jobs yet.",
  "presence.status.online.label": "Online",
  "presence.status.online.detail": "You can be offered jobs in your area right now.",
  "presence.status.stale.label": "Connection lost",
  "presence.status.stale.detail":
    "We have not heard from your phone recently, so you may not be offered jobs. Check your signal.",
  "presence.status.locationDenied.label": "Location needed",
  "presence.status.locationDenied.detail":
    "We need your location to offer you nearby jobs. Allow location for this site, then go online again.",
  "presence.status.unknown.label": "Not sure",
  "presence.status.unknown.detail":
    "We could not confirm whether you are online. Do not rely on this — check again in a moment.",

  "presence.panel.heading": "Your availability",
  "presence.panel.consentNotice":
    "Accept the Partner agreements before going online — we record which version you agreed to alongside your location.",
  "presence.panel.areasError.title": "We could not load your areas",
  "presence.panel.areasError.message": "You are not online. Check your connection and try again.",
  "presence.panel.restoring": "Checking your last session…",
  "presence.panel.goOnline": "Go online",
  "presence.panel.goingOnline": "Going online",
  "presence.panel.goOffline": "Go offline",
  "presence.panel.goingOffline": "Going offline",
  "presence.panel.locationNote":
    "While you are online we keep a coarse location so we can offer you nearby work. It stops the moment you go offline.",

  "presence.driver.availabilityLabel": "Availability",
  "presence.driver.consentNotice": "Accept the Partner agreements before going online.",
  "presence.driver.goOfflineAria": "Go offline",
  "presence.driver.goOnlineAria": "Go online",
  "presence.driver.tapToGoOffline": "Tap to go offline",
  "presence.driver.tapToGoOnline": "Tap to go online",

  "presence.areaPicker.placeholder": "Choose your area…",
  "presence.areaPicker.dialogTitle": "Choose Service Area",
  "presence.areaPicker.dialogDescription":
    "Select the operational area where you want to receive on-duty job offers.",
  "presence.areaPicker.empty": "No service areas available.",
  "presence.areaPicker.highDemand": "High booking demand",

  "presence.account.loading": "Loading your account…",
};

const te: Catalog = {
  "notifications.bell.ariaLabel.unknown": "నోటిఫికేషన్లు",
  "notifications.bell.ariaLabel.none": "నోటిఫికేషన్లు, ఏదీ చదవనివి లేవు",
  "notifications.bell.ariaLabel.count": "నోటిఫికేషన్లు, {count} చదవనివి",

  "notifications.panel.title": "నోటిఫికేషన్లు",
  "notifications.panel.markAllRead": "అన్నీ చదివినట్లు చేయండి",
  "notifications.panel.markingAllRead": "అన్నింటినీ చదివినట్లు చేస్తోంది",
  "notifications.panel.loading": "మీ నోటిఫికేషన్లు లోడ్ అవుతున్నాయి",
  "notifications.panel.empty.title": "ఇంకా చదవడానికి ఏమీ లేదు",
  "notifications.panel.empty.description":
    "పని నిర్ధారించినప్పుడు, కస్టమర్ సమాధానం ఇచ్చినప్పుడు, డబ్బు జమ అయినప్పుడు Vsolve ఇక్కడ మీకు చెబుతుంది. మీరు చేయాల్సినది ఏమీ లేదు.",
  "notifications.panel.truncated":
    "ఇక్కడ మీ తాజా నోటీసులు మాత్రమే చూపబడతాయి. పాతవి ఆ పనికి సంబంధించిన పేజీలో ఉంటాయి.",
  "notifications.row.unreadSr": "చదవలేదు. ",
  "notifications.row.clearTitle": "నోటిఫికేషన్ తీసివేయండి",
  "notifications.row.clearAriaLabel": "నోటిఫికేషన్ తీసివేయండి: {title}",
  "notifications.row.markRead": "చదివినట్లు చేయండి",
  "notifications.row.markReadSr": ": {title}",
  "notifications.row.open": "తెరవండి",
  "notifications.row.openSr": ": {title}",
  "notifications.markReadRefusal.notFound.title": "ఆ నోటీసు ఇక్కడ లేదు",
  "notifications.markReadRefusal.notFound.message":
    "అది మరోచోట చదివారు, లేదా తీసివేయబడింది. ఇప్పుడు వేచి ఉన్నది ఏమిటో చూడటానికి ఈ పేనెల్‌ని మూసి, మళ్ళీ తెరవండి.",
  "notifications.markReadRefusal.generic.title": "మేము దాన్ని చదివినట్లు చేయలేకపోయాం",
  "notifications.markReadRefusal.generic.message":
    "ఏమీ మారలేదు, నోటీసు ఇంకా ఇక్కడే ఉంది. ఒక్క నిమిషంలో మళ్ళీ ప్రయత్నించండి.",

  "notifications.liveBooking.timer.label": "స్పందించడానికి సమయం",
  "notifications.liveBooking.timer.expired": "ఈ వ్యవధి ముగిసింది. పని ముందుకు వెళ్ళి ఉండవచ్చు.",
  "notifications.liveBooking.timer.running": "టైమర్ ముగిసేలోపు అంగీకరించండి లేదా తిరస్కరించండి.",
  "notifications.liveBooking.waitingCount":
    "{count} మరింత వేచి ఉన్నాయి — దీనికి సమాధానం ఇచ్చాక తర్వాతది తెరుచుకుంటుంది.",
  "notifications.liveBooking.decline": "తిరస్కరించండి",
  "notifications.liveBooking.accept": "అంగీకరించండి",
  "notifications.liveBooking.accepting": "అంగీకరిస్తోంది",
  "notifications.liveBooking.loadingServiceDetails": "సేవ వివరాలు లోడ్ అవుతున్నాయి…",
  "notifications.liveBooking.service": "సేవ",

  "notifications.offerPopup.title": "కొత్త బుకింగ్ అభ్యర్థన",
  "notifications.offerPopup.description":
    "ఇప్పుడే ఒక కస్టమర్ బుక్ చేశారు. పనిని తీసుకోవడానికి అంగీకరించండి లేదా వదిలేయడానికి తిరస్కరించండి.",
  "notifications.offerPopup.actionNeeded.title": "ఇప్పుడే చర్య అవసరం",
  "notifications.offerPopup.actionNeeded.message":
    "ఈ ఆఫర్ త్వరలో గడువు ముగుస్తుంది. మీరు వేచి ఉంటే మరో పార్ట్‌నర్ దీన్ని తీసుకోవచ్చు.",
  "notifications.offerPopup.detailsUnavailable":
    "మేము సేవ వివరాలను లోడ్ చేయలేకపోయాం. మీరు ఇప్పటికీ అంగీకరించవచ్చు లేదా తిరస్కరించవచ్చు, లేదా పూర్తి బుకింగ్‌ని చూడటానికి Work తెరవండి.",
  "notifications.offerPopup.youReceive": "మీకు వచ్చేది (అంచనా)",
  "notifications.offerPopup.updateError": "ఈ ఆఫర్‌ని అప్‌డేట్ చేయలేకపోయాం",

  "notifications.fixedVisit.youReceive": "మీకు వచ్చేది",
  "notifications.fixedVisit.service": "సేవ",
  "notifications.fixedVisit.area": "ప్రాంతం",
  "notifications.fixedVisit.when": "ఎప్పుడు",
  "notifications.fixedVisit.onSite": "సైట్‌లో",
  "notifications.fixedVisit.durationMinutes": "{minutes} నిమి.",
  "notifications.fixedVisit.note":
    "కస్టమర్ ఈ సమయాన్ని ఎంచుకున్నారు. తీసుకోండి లేదా వదిలేయండి — షెడ్యూల్ చేయడానికి ఏమీ లేదు.",

  "notifications.invitationPopup.description.fixedVisit":
    "మీ దగ్గర్లో ఒక కస్టమర్ విజిట్ సమయాన్ని బుక్ చేశారు.",
  "notifications.invitationPopup.description.open":
    "ఒక కస్టమర్ మీ సమాధానం కోసం వేచి ఉన్నారు. సేవను చూసి స్పందించండి.",
  "notifications.invitationPopup.decline.fixedVisit": "ఈసారి వదిలేయండి",
  "notifications.invitationPopup.accepting.fixedVisit": "తీసుకుంటోంది",
  "notifications.invitationPopup.accept.fixedVisit": "ఈ విజిట్‌ని తీసుకోండి",
  "notifications.invitationPopup.alert.title.fixedVisit": "ముందుగా తీసుకున్నవారికే వస్తుంది",
  "notifications.invitationPopup.alert.title.open": "కొత్త కస్టమర్ ఎంక్వైరీ",
  "notifications.invitationPopup.alert.message.fixedVisit":
    "ఈ విజిట్‌ని ఇతర నిపుణులకు కూడా ఆఫర్ చేశారు. టైమర్ ముగిసేలోపు స్పందించండి.",
  "notifications.invitationPopup.alert.message.open":
    "కింద సేవను చూసి స్పందించడానికి అంగీకరించండి, లేదా స్లాట్‌ని వదిలేయడానికి తిరస్కరించండి.",
  "notifications.invitationPopup.aboutService": "సేవ గురించి",
  "notifications.invitationPopup.detailsError.title": "పూర్తి వివరాలు లోడ్ చేయలేకపోయాం",
  "notifications.invitationPopup.detailsError.message":
    "మీరు ఇప్పటికీ కింద అంగీకరించవచ్చు లేదా తిరస్కరించవచ్చు. అవసరమైతే పూర్తి ఎంక్వైరీ కోసం Work తెరవండి.",
  "notifications.invitationPopup.updateError.enquiry": "ఈ ఎంక్వైరీని అప్‌డేట్ చేయలేకపోయాం",

  "presence.status.checking.label": "చూస్తున్నాం",
  "presence.status.checking.detail": "మీరు ఇంకా ఆన్‌లైన్‌లో ఉన్నారా అని నిర్ధారిస్తున్నాం.",
  "presence.status.offline.label": "ఆఫ్‌లైన్",
  "presence.status.offline.detail": "మీరు ఆన్‌లైన్‌కి వెళ్ళే వరకు మీకు ఏ పనులూ ఆఫర్ చేయబడవు.",
  "presence.status.connecting.label": "ఆన్‌లైన్‌కి వెళ్తోంది",
  "presence.status.connecting.detail":
    "మీ లోకేషన్‌ని మాతో నిర్ధారిస్తున్నాం. మీకు ఇంకా పనులు రావడం లేదు.",
  "presence.status.online.label": "ఆన్‌లైన్",
  "presence.status.online.detail": "ఇప్పుడు మీ ప్రాంతంలో మీకు పనులు ఆఫర్ చేయవచ్చు.",
  "presence.status.stale.label": "కనెక్షన్ తెగిపోయింది",
  "presence.status.stale.detail":
    "మీ ఫోన్ నుండి ఇప్పుడే మాకు సమాచారం రాలేదు, కాబట్టి మీకు పనులు ఆఫర్ కాకపోవచ్చు. మీ సిగ్నల్‌ని చూడండి.",
  "presence.status.locationDenied.label": "లోకేషన్ కావాలి",
  "presence.status.locationDenied.detail":
    "దగ్గర్లో పనులు ఆఫర్ చేయడానికి మీ లోకేషన్ కావాలి. ఈ సైట్ కోసం లోకేషన్‌ని అనుమతించి, మళ్ళీ ఆన్‌లైన్‌కి వెళ్ళండి.",
  "presence.status.unknown.label": "ఖచ్చితంగా తెలియదు",
  "presence.status.unknown.detail":
    "మీరు ఆన్‌లైన్‌లో ఉన్నారా అని మేము నిర్ధారించలేకపోయాం. దీన్ని నమ్మకండి — ఒక్క నిమిషంలో మళ్ళీ చూడండి.",

  "presence.panel.heading": "మీ లభ్యత",
  "presence.panel.consentNotice":
    "ఆన్‌లైన్‌కి వెళ్ళే ముందు పార్ట్‌నర్ అగ్రిమెంట్లను అంగీకరించండి — మీ లోకేషన్‌తో పాటు మీరు అంగీకరించిన వెర్షన్‌ని మేము రికార్డ్ చేస్తాం.",
  "presence.panel.areasError.title": "మేము మీ ప్రాంతాలను లోడ్ చేయలేకపోయాం",
  "presence.panel.areasError.message": "మీరు ఆన్‌లైన్‌లో లేరు. మీ కనెక్షన్‌ని చూసి మళ్ళీ ప్రయత్నించండి.",
  "presence.panel.restoring": "మీ చివరి సెషన్‌ని చూస్తున్నాం…",
  "presence.panel.goOnline": "ఆన్‌లైన్‌కి వెళ్ళండి",
  "presence.panel.goingOnline": "ఆన్‌లైన్‌కి వెళ్తోంది",
  "presence.panel.goOffline": "ఆఫ్‌లైన్‌కి వెళ్ళండి",
  "presence.panel.goingOffline": "ఆఫ్‌లైన్‌కి వెళ్తోంది",
  "presence.panel.locationNote":
    "మీరు ఆన్‌లైన్‌లో ఉన్నప్పుడు, దగ్గర్లో పని అందించడానికి మేము ఒక సాధారణ లోకేషన్‌ని ఉంచుతాం. మీరు ఆఫ్‌లైన్‌కి వెళ్ళిన వెంటనే అది ఆగిపోతుంది.",

  "presence.driver.availabilityLabel": "లభ్యత",
  "presence.driver.consentNotice": "ఆన్‌లైన్‌కి వెళ్ళే ముందు పార్ట్‌నర్ అగ్రిమెంట్లను అంగీకరించండి.",
  "presence.driver.goOfflineAria": "ఆఫ్‌లైన్‌కి వెళ్ళండి",
  "presence.driver.goOnlineAria": "ఆన్‌లైన్‌కి వెళ్ళండి",
  "presence.driver.tapToGoOffline": "ఆఫ్‌లైన్‌కి వెళ్ళడానికి నొక్కండి",
  "presence.driver.tapToGoOnline": "ఆన్‌లైన్‌కి వెళ్ళడానికి నొక్కండి",

  "presence.areaPicker.placeholder": "మీ ప్రాంతాన్ని ఎంచుకోండి…",
  "presence.areaPicker.dialogTitle": "సర్వీస్ ఏరియాని ఎంచుకోండి",
  "presence.areaPicker.dialogDescription":
    "డ్యూటీలో ఉన్నప్పుడు పని ఆఫర్‌లు పొందాలనుకునే ఆపరేషనల్ ప్రాంతాన్ని ఎంచుకోండి.",
  "presence.areaPicker.empty": "సర్వీస్ ఏరియాలు అందుబాటులో లేవు.",
  "presence.areaPicker.highDemand": "డిమాండ్ ఎక్కువగా ఉంది",

  "presence.account.loading": "మీ ఖాతా లోడ్ అవుతోంది…",
};

const hi: Catalog = {
  "notifications.bell.ariaLabel.unknown": "सूचनाएं",
  "notifications.bell.ariaLabel.none": "सूचनाएं, कुछ भी अपठित नहीं",
  "notifications.bell.ariaLabel.count": "सूचनाएं, {count} अपठित",

  "notifications.panel.title": "सूचनाएं",
  "notifications.panel.markAllRead": "सभी को पढ़ा हुआ चिह्नित करें",
  "notifications.panel.markingAllRead": "सभी को पढ़ा हुआ चिह्नित किया जा रहा है",
  "notifications.panel.loading": "आपकी सूचनाएं लोड हो रही हैं",
  "notifications.panel.empty.title": "अभी पढ़ने के लिए कुछ नहीं है",
  "notifications.panel.empty.description":
    "जब कोई काम कन्फ़र्म होता है, कोई ग्राहक जवाब देता है, या पैसा आता है, तो Vsolve आपको यहां बताता है। आपको कुछ करने की ज़रूरत नहीं है।",
  "notifications.panel.truncated":
    "यहां सिर्फ़ आपकी हाल की सूचनाएं दिखाई गई हैं। पुरानी सूचनाएं उसी काम के पेज पर रहती हैं।",
  "notifications.row.unreadSr": "अपठित। ",
  "notifications.row.clearTitle": "सूचना हटाएं",
  "notifications.row.clearAriaLabel": "सूचना हटाएं: {title}",
  "notifications.row.markRead": "पढ़ा हुआ चिह्नित करें",
  "notifications.row.markReadSr": ": {title}",
  "notifications.row.open": "खोलें",
  "notifications.row.openSr": ": {title}",
  "notifications.markReadRefusal.notFound.title": "वह सूचना अब यहां नहीं है",
  "notifications.markReadRefusal.notFound.message":
    "इसे कहीं और पढ़ा गया है, या हटा दिया गया है। अभी क्या इंतज़ार में है, यह देखने के लिए इस पैनल को बंद करें और फिर से खोलें।",
  "notifications.markReadRefusal.generic.title": "हम उसे पढ़ा हुआ चिह्नित नहीं कर सके",
  "notifications.markReadRefusal.generic.message":
    "कुछ नहीं बदला है, सूचना अभी भी यहां है। एक पल में फिर से कोशिश करें।",

  "notifications.liveBooking.timer.label": "जवाब देने का समय",
  "notifications.liveBooking.timer.expired": "यह विंडो बंद हो गई है। यह काम किसी और को मिल गया होगा।",
  "notifications.liveBooking.timer.running": "टाइमर खत्म होने से पहले स्वीकार करें या अस्वीकार करें।",
  "notifications.liveBooking.waitingCount":
    "{count} और इंतज़ार में हैं — इसका जवाब देने पर अगला खुलेगा।",
  "notifications.liveBooking.decline": "अस्वीकार करें",
  "notifications.liveBooking.accept": "स्वीकार करें",
  "notifications.liveBooking.accepting": "स्वीकार किया जा रहा है",
  "notifications.liveBooking.loadingServiceDetails": "सेवा का विवरण लोड हो रहा है…",
  "notifications.liveBooking.service": "सेवा",

  "notifications.offerPopup.title": "नई बुकिंग रिक्वेस्ट",
  "notifications.offerPopup.description":
    "एक ग्राहक ने अभी बुक किया है। काम लेने के लिए स्वीकार करें या छोड़ने के लिए अस्वीकार करें।",
  "notifications.offerPopup.actionNeeded.title": "अभी कार्रवाई ज़रूरी है",
  "notifications.offerPopup.actionNeeded.message":
    "यह ऑफ़र जल्द ही खत्म हो जाएगा। आपके इंतज़ार करने पर कोई और पार्टनर इसे ले सकता है।",
  "notifications.offerPopup.detailsUnavailable":
    "हम सेवा का विवरण लोड नहीं कर सके। आप अभी भी स्वीकार या अस्वीकार कर सकते हैं, या पूरी बुकिंग देखने के लिए Work खोलें।",
  "notifications.offerPopup.youReceive": "आपको मिलेगा (अनुमानित)",
  "notifications.offerPopup.updateError": "इस ऑफ़र को अपडेट नहीं कर सके",

  "notifications.fixedVisit.youReceive": "आपको मिलेगा",
  "notifications.fixedVisit.service": "सेवा",
  "notifications.fixedVisit.area": "क्षेत्र",
  "notifications.fixedVisit.when": "कब",
  "notifications.fixedVisit.onSite": "साइट पर",
  "notifications.fixedVisit.durationMinutes": "{minutes} मिनट",
  "notifications.fixedVisit.note":
    "ग्राहक ने यह समय चुना है। लें या छोड़ें — शेड्यूल करने के लिए कुछ नहीं है।",

  "notifications.invitationPopup.description.fixedVisit":
    "आपके पास एक ग्राहक ने विज़िट का समय बुक किया है।",
  "notifications.invitationPopup.description.open":
    "एक ग्राहक आपके जवाब का इंतज़ार कर रहा है। सेवा देखें और जवाब दें।",
  "notifications.invitationPopup.decline.fixedVisit": "इस बार छोड़ दें",
  "notifications.invitationPopup.accepting.fixedVisit": "लिया जा रहा है",
  "notifications.invitationPopup.accept.fixedVisit": "यह विज़िट लें",
  "notifications.invitationPopup.alert.title.fixedVisit": "जो पहले ले, उसे मिलेगा",
  "notifications.invitationPopup.alert.title.open": "नई ग्राहक पूछताछ",
  "notifications.invitationPopup.alert.message.fixedVisit":
    "यह विज़िट दूसरे पेशेवरों को भी ऑफ़र की गई है। टाइमर खत्म होने से पहले जवाब दें।",
  "notifications.invitationPopup.alert.message.open":
    "नीचे सेवा देखकर जवाब देने के लिए स्वीकार करें, या स्लॉट छोड़ने के लिए अस्वीकार करें।",
  "notifications.invitationPopup.aboutService": "सेवा के बारे में",
  "notifications.invitationPopup.detailsError.title": "पूरा विवरण लोड नहीं हो सका",
  "notifications.invitationPopup.detailsError.message":
    "आप अभी भी नीचे स्वीकार या अस्वीकार कर सकते हैं। ज़रूरत हो तो पूरी पूछताछ के लिए Work खोलें।",
  "notifications.invitationPopup.updateError.enquiry": "इस पूछताछ को अपडेट नहीं कर सके",

  "presence.status.checking.label": "जांच रहे हैं",
  "presence.status.checking.detail": "आप अब भी ऑनलाइन हैं या नहीं, इसकी पुष्टि की जा रही है।",
  "presence.status.offline.label": "ऑफ़लाइन",
  "presence.status.offline.detail": "ऑनलाइन जाने तक आपको कोई काम ऑफ़र नहीं किया जाएगा।",
  "presence.status.connecting.label": "ऑनलाइन जा रहे हैं",
  "presence.status.connecting.detail":
    "हम आपकी लोकेशन की पुष्टि कर रहे हैं। आपको अभी काम नहीं मिल रहे हैं।",
  "presence.status.online.label": "ऑनलाइन",
  "presence.status.online.detail": "अभी आपके क्षेत्र में आपको काम ऑफ़र किए जा सकते हैं।",
  "presence.status.stale.label": "कनेक्शन टूट गया",
  "presence.status.stale.detail":
    "हमें आपके फ़ोन से हाल ही में कोई जवाब नहीं मिला है, इसलिए आपको काम ऑफ़र नहीं हो सकते। अपना सिग्नल जांचें।",
  "presence.status.locationDenied.label": "लोकेशन चाहिए",
  "presence.status.locationDenied.detail":
    "आपके पास के काम दिखाने के लिए हमें आपकी लोकेशन चाहिए। इस साइट के लिए लोकेशन की अनुमति दें, फिर से ऑनलाइन जाएं।",
  "presence.status.unknown.label": "पता नहीं",
  "presence.status.unknown.detail":
    "हम पुष्टि नहीं कर सके कि आप ऑनलाइन हैं या नहीं। इस पर भरोसा न करें — एक पल में फिर से जांचें।",

  "presence.panel.heading": "आपकी उपलब्धता",
  "presence.panel.consentNotice":
    "ऑनलाइन जाने से पहले पार्टनर एग्रीमेंट स्वीकार करें — हम आपकी लोकेशन के साथ यह भी रिकॉर्ड करते हैं कि आपने किस वर्शन को स्वीकार किया।",
  "presence.panel.areasError.title": "हम आपके क्षेत्र लोड नहीं कर सके",
  "presence.panel.areasError.message": "आप ऑनलाइन नहीं हैं। अपना कनेक्शन देखें और फिर से कोशिश करें।",
  "presence.panel.restoring": "आपका पिछला सेशन जांचा जा रहा है…",
  "presence.panel.goOnline": "ऑनलाइन जाएं",
  "presence.panel.goingOnline": "ऑनलाइन जा रहे हैं",
  "presence.panel.goOffline": "ऑफ़लाइन जाएं",
  "presence.panel.goingOffline": "ऑफ़लाइन जा रहे हैं",
  "presence.panel.locationNote":
    "जब तक आप ऑनलाइन हैं, हम आपको पास का काम दिखाने के लिए एक अनुमानित लोकेशन रखते हैं। ऑफ़लाइन जाते ही यह बंद हो जाता है।",

  "presence.driver.availabilityLabel": "उपलब्धता",
  "presence.driver.consentNotice": "ऑनलाइन जाने से पहले पार्टनर एग्रीमेंट स्वीकार करें।",
  "presence.driver.goOfflineAria": "ऑफ़लाइन जाएं",
  "presence.driver.goOnlineAria": "ऑनलाइन जाएं",
  "presence.driver.tapToGoOffline": "ऑफ़लाइन जाने के लिए टैप करें",
  "presence.driver.tapToGoOnline": "ऑनलाइन जाने के लिए टैप करें",

  "presence.areaPicker.placeholder": "अपना क्षेत्र चुनें…",
  "presence.areaPicker.dialogTitle": "सर्विस एरिया चुनें",
  "presence.areaPicker.dialogDescription":
    "वह ऑपरेशनल क्षेत्र चुनें जहां आप ड्यूटी पर काम के ऑफ़र पाना चाहते हैं।",
  "presence.areaPicker.empty": "कोई सर्विस एरिया उपलब्ध नहीं है।",
  "presence.areaPicker.highDemand": "ज़्यादा डिमांड है",

  "presence.account.loading": "आपका खाता लोड हो रहा है…",
};

export const catalogsByLocale: Record<Locale, Catalog> = {
  "en-IN": en,
  "te-IN": te,
  "hi-IN": hi,
};
