import type { Catalog, Locale } from "@vsolve/ui";

/** `/me/crew` — the crew roster: screen, form, edit form, gender field, document uploader. */

const en: Catalog = {
  "crew.screen.title": "Your crew",
  "crew.screen.description":
    "The people you send to work. We check nobody is booked twice on the same day, including through another agency.",
  "crew.screen.unrecognisedCount": {
    other: "{count} people we cannot describe.",
    one: "{count} person we cannot describe.",
  },
  "crew.screen.unrecognisedBody":
    "Your app is older than this part of Vsolve, so we do not know whether they are on your roster. Update it, or contact support before you rely on this list for a shift.",
  "crew.toast.reinstated": "{name} is back on your roster.",
  "crew.toast.added": "{name} added to your roster.",
  "crew.toast.updated": "{name} updated.",

  "crew.roster.loading": "Loading your crew",
  "crew.roster.emptyTitle": "No one on your roster yet",
  "crew.roster.emptyDescription":
    "Add the people you send to work. We check nobody is double-booked on a day, including through another agency.",
  "crew.roster.addSomeone": "Add someone",
  "crew.roster.noSupervisorBold": "Nobody can report attendance.",
  "crew.roster.noSupervisorBody":
    "Mark at least one person as a supervisor — they are who confirms how many of your crew turned up each day.",
  "crew.roster.heading": "Your crew ({count})",
  "crew.roster.archivedSummary": "People you have archived ({count})",
  "crew.roster.archivedHint":
    "Adding an archived person again puts them back on your roster — you do not need to re-enter their details.",
  "crew.roster.supervisorBadge": "Supervisor",
  "crew.roster.documentsChecked": "Documents checked",
  "crew.roster.documentsNotChecked": "Documents not checked",
  "crew.roster.sendIdHint": "Send their ID so Operations can check it.",
  "crew.roster.withOperationsHint": "Their documents are with Operations.",
  "crew.roster.editDetails": "Edit details",
  "crew.roster.archive": "Archive",
  "crew.roster.archiving": "Archiving",
  "crew.roster.archiveConfirmTitle": "Archive {name}?",
  "crew.roster.archiveConsequence":
    "They stop appearing when you assign crew. Nothing they have already worked is affected, and you can put them back at any time.",
  "crew.roster.genderGap": {
    other: "{count} people have no man/woman recorded.",
    one: "One person has no man/woman recorded.",
  },
  "crew.roster.genderGapBody":
    "Customers booking event staff ask for a number of men and a number of women, and Vsolve can only count someone toward that once it is set. Open anyone below to add it.",

  "crew.problem.nameTooShort": "Add the name your team knows this person by.",
  "crew.problem.invalidPhone":
    "Enter a 10-digit mobile number. We use it to make sure nobody is double-booked.",

  "crew.form.title": "Add someone to your crew",
  "crew.form.nameLabel": "Name",
  "crew.form.nameDescription": "What your team calls them. Customers do not see it before a shift.",
  "crew.form.phoneLabel": "Mobile number",
  "crew.form.phoneDescription": "We use it to make sure nobody is booked twice on the same day.",
  "crew.form.duplicateHintPrefix": "This looks like",
  "crew.form.duplicateHintSuffix":
    ", who is already on your roster. If it is someone else, carry on — we check the full number.",
  "crew.form.whatTheyDo": "What they do",
  "crew.form.supervisorLabel": "They can report attendance.",
  "crew.form.supervisorHelp":
    "Supervisors confirm how many of the crew turned up each day. You need at least one.",
  "crew.form.errorTitle": "We could not add them",
  "crew.form.submit": "Add to roster",
  "crew.form.adding": "Adding",

  "crew.edit.title": "Edit {name}",
  "crew.edit.description": "Update how this person works with your agency",
  "crew.edit.nameLabel": "Name",
  "crew.edit.nameDescription":
    "What your team calls them. Changing it here does not change any other agency's list.",
  "crew.edit.nameRequired": "Give them a name your team will recognise.",
  "crew.edit.phoneNote":
    "Their mobile number identifies them across agency rosters and stops the same person being booked twice on one day, so it cannot be changed. If the number is wrong, that is a different person — add them instead.",
  "crew.edit.supervisorLabel": "They can report attendance.",
  "crew.edit.supervisorHelp": "Supervisors confirm how many crew members turned up each day.",
  "crew.edit.errorTitle": "We could not save these changes",
  "crew.edit.save": "Save changes",
  "crew.edit.documentsTitle": "Identity documents",
  "crew.edit.documentsChecked": "Checked by Operations",
  "crew.edit.documentsNotChecked": "Not checked yet",
  "crew.edit.documentsHint":
    "Operations checks these before this person can be assigned to customer work. Vsolve staff review them — you cannot mark your own crew as checked.",

  "crew.gender.notRecorded": "Not recorded",
  "crew.gender.man": "Man",
  "crew.gender.woman": "Woman",
  "crew.gender.other": "Other",
  "crew.gender.undisclosed": "Prefers not to say",
  "crew.gender.fieldLabel": "Man or woman",
  "crew.gender.fieldDescription":
    "Customers booking event staff ask for a number of men and a number of women. Vsolve can only count someone toward that once this is recorded.",

  "crew.documents.addressProof": "Address proof",
  "crew.documents.policeVerification": "Police verification",
  "crew.documents.approved": "Approved",
  "crew.documents.withOperations": "With Operations",
  "crew.documents.rejected": "Rejected",
  "crew.documents.governmentId": "Government ID",
  "crew.documents.governmentIdHint":
    "Aadhaar, voter ID, driving licence or passport. Required before they can be assigned.",
  "crew.documents.ifYouHaveIt": "If you have it.",
  "crew.documents.tooLarge": "That file is {size}. Send something smaller.",
  "crew.documents.cannotSendTitle": "We cannot send that file",
  "crew.documents.uploadFailedTitle": "The upload did not finish",
  "crew.documents.required": "(required)",
  "crew.documents.sending": "Sending… {percent}%",
  "crew.documents.replace": "Replace",
  "crew.documents.chooseFile": "Choose file",
  "crew.upload.expired": "That upload link expired before it was used.",
  "crew.upload.storageRefused": "Storage refused the upload ({status}).",
  "crew.upload.unreachable": "The upload could not reach storage.",
  "crew.upload.cancelled": "The upload was cancelled.",
};

const te: Catalog = {
  "crew.screen.title": "మీ సిబ్బంది",
  "crew.screen.description":
    "మీరు పనికి పంపే వ్యక్తులు. ఒకరే ఒక రోజు రెండుసార్లు బుక్ అవ్వకుండా చూస్తాం, మరో ఏజెన్సీ ద్వారా అయినా సరే.",
  "crew.screen.unrecognisedCount": {
    other: "మేము వివరించలేని {count} మంది.",
    one: "మేము వివరించలేని {count} వ్యక్తి.",
  },
  "crew.screen.unrecognisedBody":
    "మీ యాప్ Vsolve లోని ఈ భాగం కంటే పాతది, కాబట్టి వీరు మీ రోస్టర్‌లో ఉన్నారో లేదో మాకు తెలియదు. దాన్ని అప్‌డేట్ చేయండి, లేదా ఈ లిస్ట్‌ను షిఫ్ట్ కోసం వాడే ముందు సపోర్ట్‌ని సంప్రదించండి.",
  "crew.toast.reinstated": "{name} మళ్ళీ మీ రోస్టర్‌లోకి వచ్చారు.",
  "crew.toast.added": "{name} మీ రోస్టర్‌కు జోడించబడ్డారు.",
  "crew.toast.updated": "{name} అప్‌డేట్ చేయబడ్డారు.",

  "crew.roster.loading": "మీ సిబ్బంది లోడ్ అవుతున్నారు",
  "crew.roster.emptyTitle": "ఇంకా మీ రోస్టర్‌లో ఎవరూ లేరు",
  "crew.roster.emptyDescription":
    "మీరు పనికి పంపే వ్యక్తులను జోడించండి. ఒకరే ఒక రోజు రెండుసార్లు బుక్ అవ్వకుండా చూస్తాం, మరో ఏజెన్సీ ద్వారా అయినా సరే.",
  "crew.roster.addSomeone": "ఒకరిని జోడించండి",
  "crew.roster.noSupervisorBold": "ఎవరూ అటెండెన్స్ చెప్పలేరు.",
  "crew.roster.noSupervisorBody":
    "కనీసం ఒకరిని సూపర్‌వైజర్‌గా మార్క్ చేయండి — ప్రతి రోజు మీ సిబ్బందిలో ఎంతమంది వచ్చారో చెప్పేది వారే.",
  "crew.roster.heading": "మీ సిబ్బంది ({count})",
  "crew.roster.archivedSummary": "మీరు ఆర్కైవ్ చేసిన వ్యక్తులు ({count})",
  "crew.roster.archivedHint":
    "ఆర్కైవ్ చేసిన వ్యక్తిని మళ్ళీ జోడిస్తే వారు మీ రోస్టర్‌కు తిరిగి వస్తారు — వారి వివరాలు మళ్ళీ ఎంటర్ చేయాల్సిన అవసరం లేదు.",
  "crew.roster.supervisorBadge": "సూపర్‌వైజర్",
  "crew.roster.documentsChecked": "పత్రాలు చెక్ చేయబడ్డాయి",
  "crew.roster.documentsNotChecked": "పత్రాలు చెక్ చేయలేదు",
  "crew.roster.sendIdHint": "ఆపరేషన్స్ చెక్ చేయడానికి వారి ID పంపండి.",
  "crew.roster.withOperationsHint": "వారి పత్రాలు ఆపరేషన్స్ వద్ద ఉన్నాయి.",
  "crew.roster.editDetails": "వివరాలు సవరించండి",
  "crew.roster.archive": "ఆర్కైవ్ చేయండి",
  "crew.roster.archiving": "ఆర్కైవ్ అవుతోంది",
  "crew.roster.archiveConfirmTitle": "{name}ని ఆర్కైవ్ చేయాలా?",
  "crew.roster.archiveConsequence":
    "మీరు సిబ్బందిని అసైన్ చేసేటప్పుడు వారు కనిపించరు. వారు ఇప్పటికే చేసిన పనిపై ఎలాంటి ప్రభావం ఉండదు, మరియు మీరు ఎప్పుడైనా వారిని తిరిగి తీసుకోవచ్చు.",
  "crew.roster.genderGap": {
    other: "{count} మందికి స్త్రీ/పురుష వివరాలు నమోదు కాలేదు.",
    one: "ఒక వ్యక్తికి స్త్రీ/పురుష వివరాలు నమోదు కాలేదు.",
  },
  "crew.roster.genderGapBody":
    "ఈవెంట్ సిబ్బందిని బుక్ చేసే కస్టమర్లు కొంతమంది పురుషులు, కొంతమంది స్త్రీలు కావాలని అడుగుతారు, మరియు ఇది నమోదైతేనే Vsolve ఆ కౌంట్‌లో చేర్చగలదు. దిగువ ఎవరినైనా తెరిచి దాన్ని జోడించండి.",

  "crew.problem.nameTooShort": "మీ టీమ్ ఈ వ్యక్తిని పిలిచే పేరును జోడించండి.",
  "crew.problem.invalidPhone":
    "10 అంకెల మొబైల్ నంబర్ ఇవ్వండి. ఎవరూ డబుల్-బుక్ అవ్వకుండా చూడటానికి దీన్ని వాడుతాం.",

  "crew.form.title": "మీ సిబ్బందికి ఒకరిని జోడించండి",
  "crew.form.nameLabel": "పేరు",
  "crew.form.nameDescription": "మీ టీమ్ వారిని ఏ పేరుతో పిలుస్తుంది. షిఫ్ట్ ముందు కస్టమర్లకు ఇది కనిపించదు.",
  "crew.form.phoneLabel": "మొబైల్ నంబర్",
  "crew.form.phoneDescription": "ఒకరే రోజు రెండుసార్లు బుక్ అవ్వకుండా చూడటానికి దీన్ని వాడుతాం.",
  "crew.form.duplicateHintPrefix": "ఇది",
  "crew.form.duplicateHintSuffix":
    " లా కనిపిస్తోంది, వారు ఇప్పటికే మీ రోస్టర్‌లో ఉన్నారు. వేరే వ్యక్తి అయితే, కొనసాగించండి — మేము పూర్తి నంబర్‌ని చెక్ చేస్తాం.",
  "crew.form.whatTheyDo": "వారు ఏం చేస్తారు",
  "crew.form.supervisorLabel": "వారు అటెండెన్స్ చెప్పగలరు.",
  "crew.form.supervisorHelp":
    "సూపర్‌వైజర్లు ప్రతి రోజు సిబ్బందిలో ఎంతమంది వచ్చారో నిర్ధారిస్తారు. మీకు కనీసం ఒకరు కావాలి.",
  "crew.form.errorTitle": "వారిని జోడించలేకపోయాం",
  "crew.form.submit": "రోస్టర్‌కు జోడించండి",
  "crew.form.adding": "జోడిస్తోంది",

  "crew.edit.title": "{name}ని సవరించండి",
  "crew.edit.description": "ఈ వ్యక్తి మీ ఏజెన్సీతో ఎలా పనిచేస్తారో అప్‌డేట్ చేయండి",
  "crew.edit.nameLabel": "పేరు",
  "crew.edit.nameDescription":
    "మీ టీమ్ వారిని ఏ పేరుతో పిలుస్తుంది. దీన్ని ఇక్కడ మార్చినా మరో ఏజెన్సీ లిస్ట్ మారదు.",
  "crew.edit.nameRequired": "మీ టీమ్ గుర్తించే పేరును వారికి ఇవ్వండి.",
  "crew.edit.phoneNote":
    "వారి మొబైల్ నంబర్ వారిని అన్ని ఏజెన్సీ రోస్టర్‌లలో గుర్తిస్తుంది మరియు ఒకే వ్యక్తి ఒక రోజు రెండుసార్లు బుక్ అవ్వకుండా ఆపుతుంది, కాబట్టి దీన్ని మార్చలేం. నంబర్ తప్పు అయితే, అది వేరే వ్యక్తి — వారిని బదులుగా జోడించండి.",
  "crew.edit.supervisorLabel": "వారు అటెండెన్స్ చెప్పగలరు.",
  "crew.edit.supervisorHelp": "సూపర్‌వైజర్లు ప్రతి రోజు సిబ్బందిలో ఎంతమంది వచ్చారో నిర్ధారిస్తారు.",
  "crew.edit.errorTitle": "ఈ మార్పులను సేవ్ చేయలేకపోయాం",
  "crew.edit.save": "మార్పులను సేవ్ చేయండి",
  "crew.edit.documentsTitle": "గుర్తింపు పత్రాలు",
  "crew.edit.documentsChecked": "ఆపరేషన్స్ చెక్ చేసింది",
  "crew.edit.documentsNotChecked": "ఇంకా చెక్ చేయలేదు",
  "crew.edit.documentsHint":
    "ఈ వ్యక్తిని కస్టమర్ పనికి అసైన్ చేయడానికి ముందు ఆపరేషన్స్ వీటిని చెక్ చేస్తుంది. Vsolve సిబ్బంది వీటిని రివ్యూ చేస్తారు — మీ సిబ్బందిని చెక్ అయినట్టు మీరే మార్క్ చేయలేరు.",

  "crew.gender.notRecorded": "నమోదు కాలేదు",
  "crew.gender.man": "పురుషుడు",
  "crew.gender.woman": "స్త్రీ",
  "crew.gender.other": "ఇతరం",
  "crew.gender.undisclosed": "చెప్పదలచుకోలేదు",
  "crew.gender.fieldLabel": "పురుషుడు లేదా స్త్రీ",
  "crew.gender.fieldDescription":
    "ఈవెంట్ సిబ్బందిని బుక్ చేసే కస్టమర్లు కొంతమంది పురుషులు, కొంతమంది స్త్రీలు కావాలని అడుగుతారు. ఇది నమోదైతేనే Vsolve ఆ కౌంట్‌లో ఎవరినైనా చేర్చగలదు.",

  "crew.documents.addressProof": "అడ్రస్ ప్రూఫ్",
  "crew.documents.policeVerification": "పోలీస్ వెరిఫికేషన్",
  "crew.documents.approved": "ఆమోదించబడింది",
  "crew.documents.withOperations": "ఆపరేషన్స్ వద్ద ఉంది",
  "crew.documents.rejected": "తిరస్కరించబడింది",
  "crew.documents.governmentId": "గవర్నమెంట్ ID",
  "crew.documents.governmentIdHint":
    "ఆధార్, ఓటర్ ID, డ్రైవింగ్ లైసెన్స్ లేదా పాస్‌పోర్ట్. అసైన్ చేయడానికి ముందు తప్పనిసరి.",
  "crew.documents.ifYouHaveIt": "మీ వద్ద ఉంటే.",
  "crew.documents.tooLarge": "ఆ ఫైల్ {size} ఉంది. దానికంటే చిన్నదాన్ని పంపండి.",
  "crew.documents.cannotSendTitle": "మేము ఆ ఫైల్‌ని పంపలేం",
  "crew.documents.uploadFailedTitle": "అప్‌లోడ్ పూర్తవ్వలేదు",
  "crew.documents.required": "(తప్పనిసరి)",
  "crew.documents.sending": "పంపుతోంది… {percent}%",
  "crew.documents.replace": "మార్చండి",
  "crew.documents.chooseFile": "ఫైల్ ఎంచుకోండి",
  "crew.upload.expired": "ఆ అప్‌లోడ్ లింక్ వాడకముందే గడువు ముగిసింది.",
  "crew.upload.storageRefused": "స్టోరేజ్ అప్‌లోడ్‌ను తిరస్కరించింది ({status}).",
  "crew.upload.unreachable": "అప్‌లోడ్ స్టోరేజ్‌కు చేరలేదు.",
  "crew.upload.cancelled": "అప్‌లోడ్ రద్దు అయింది.",
};

const hi: Catalog = {
  "crew.screen.title": "आपकी टीम",
  "crew.screen.description":
    "वे लोग जिन्हें आप काम पर भेजते हैं। हम देखते हैं कि किसी को एक दिन में दो बार बुक न किया जाए, किसी दूसरी एजेंसी के ज़रिए भी नहीं।",
  "crew.screen.unrecognisedCount": {
    other: "{count} लोग जिन्हें हम बता नहीं सकते।",
    one: "{count} व्यक्ति जिसे हम बता नहीं सकते।",
  },
  "crew.screen.unrecognisedBody":
    "आपका ऐप Vsolve के इस हिस्से से पुराना है, इसलिए हमें नहीं पता कि वे आपकी टीम में हैं या नहीं। इसे अपडेट करें, या शिफ्ट के लिए इस लिस्ट पर भरोसा करने से पहले सपोर्ट से बात करें।",
  "crew.toast.reinstated": "{name} फिर से आपकी टीम में शामिल हो गए।",
  "crew.toast.added": "{name} आपकी टीम में जोड़े गए।",
  "crew.toast.updated": "{name} अपडेट कर दिए गए।",

  "crew.roster.loading": "आपकी टीम लोड हो रही है",
  "crew.roster.emptyTitle": "अभी आपकी टीम में कोई नहीं है",
  "crew.roster.emptyDescription":
    "जिन लोगों को आप काम पर भेजते हैं उन्हें जोड़ें। हम देखते हैं कि कोई एक दिन में दो बार बुक न हो, किसी दूसरी एजेंसी के ज़रिए भी नहीं।",
  "crew.roster.addSomeone": "किसी को जोड़ें",
  "crew.roster.noSupervisorBold": "कोई अटेंडेंस दर्ज नहीं कर सकता।",
  "crew.roster.noSupervisorBody":
    "कम से कम एक व्यक्ति को सुपरवाइज़र बनाएं — हर दिन कितने लोग आए यह बताने वाले वही होते हैं।",
  "crew.roster.heading": "आपकी टीम ({count})",
  "crew.roster.archivedSummary": "आपके आर्काइव किए हुए लोग ({count})",
  "crew.roster.archivedHint":
    "आर्काइव किए गए व्यक्ति को फिर से जोड़ने पर वे आपकी टीम में वापस आ जाते हैं — उनकी जानकारी फिर से डालने की ज़रूरत नहीं।",
  "crew.roster.supervisorBadge": "सुपरवाइज़र",
  "crew.roster.documentsChecked": "दस्तावेज़ जाँचे गए",
  "crew.roster.documentsNotChecked": "दस्तावेज़ नहीं जाँचे गए",
  "crew.roster.sendIdHint": "ऑपरेशंस के जाँचने के लिए उनकी ID भेजें।",
  "crew.roster.withOperationsHint": "उनके दस्तावेज़ ऑपरेशंस के पास हैं।",
  "crew.roster.editDetails": "जानकारी बदलें",
  "crew.roster.archive": "आर्काइव करें",
  "crew.roster.archiving": "आर्काइव हो रहा है",
  "crew.roster.archiveConfirmTitle": "{name} को आर्काइव करें?",
  "crew.roster.archiveConsequence":
    "टीम असाइन करते समय वे नहीं दिखेंगे। उनका पहले से किया काम प्रभावित नहीं होगा, और आप उन्हें कभी भी वापस ला सकते हैं।",
  "crew.roster.genderGap": {
    other: "{count} लोगों का स्त्री/पुरुष विवरण दर्ज नहीं है।",
    one: "एक व्यक्ति का स्त्री/पुरुष विवरण दर्ज नहीं है।",
  },
  "crew.roster.genderGapBody":
    "इवेंट स्टाफ बुक करने वाले कस्टमर कुछ पुरुष और कुछ महिलाएं मांगते हैं, और Vsolve किसी को तभी गिन सकता है जब यह दर्ज हो। नीचे किसी को भी खोलकर इसे जोड़ें।",

  "crew.problem.nameTooShort": "वह नाम जोड़ें जिससे आपकी टीम इस व्यक्ति को जानती है।",
  "crew.problem.invalidPhone":
    "10 अंकों का मोबाइल नंबर डालें। यह पक्का करने के लिए इस्तेमाल होता है कि कोई डबल-बुक न हो।",

  "crew.form.title": "अपनी टीम में किसी को जोड़ें",
  "crew.form.nameLabel": "नाम",
  "crew.form.nameDescription": "आपकी टीम उन्हें जिस नाम से बुलाती है। शिफ्ट से पहले कस्टमर को यह नहीं दिखता।",
  "crew.form.phoneLabel": "मोबाइल नंबर",
  "crew.form.phoneDescription": "यह पक्का करने के लिए इस्तेमाल होता है कि कोई एक ही दिन दो बार बुक न हो।",
  "crew.form.duplicateHintPrefix": "यह",
  "crew.form.duplicateHintSuffix":
    " जैसा लग रहा है, जो पहले से आपकी टीम में हैं। अगर यह कोई और है, तो आगे बढ़ें — हम पूरा नंबर जाँचते हैं।",
  "crew.form.whatTheyDo": "वे क्या करते हैं",
  "crew.form.supervisorLabel": "वे अटेंडेंस दर्ज कर सकते हैं।",
  "crew.form.supervisorHelp":
    "सुपरवाइज़र हर दिन टीम में कितने लोग आए यह पुष्टि करते हैं। आपको कम से कम एक चाहिए।",
  "crew.form.errorTitle": "हम उन्हें जोड़ नहीं सके",
  "crew.form.submit": "टीम में जोड़ें",
  "crew.form.adding": "जोड़ा जा रहा है",

  "crew.edit.title": "{name} को बदलें",
  "crew.edit.description": "यह व्यक्ति आपकी एजेंसी के साथ कैसे काम करता है, अपडेट करें",
  "crew.edit.nameLabel": "नाम",
  "crew.edit.nameDescription":
    "आपकी टीम उन्हें जिस नाम से बुलाती है। इसे यहाँ बदलने से किसी दूसरी एजेंसी की लिस्ट नहीं बदलती।",
  "crew.edit.nameRequired": "उन्हें वह नाम दें जिससे आपकी टीम उन्हें पहचानेगी।",
  "crew.edit.phoneNote":
    "उनका मोबाइल नंबर उन्हें हर एजेंसी की टीम लिस्ट में पहचानता है और एक ही व्यक्ति को एक दिन में दो बार बुक होने से रोकता है, इसलिए इसे बदला नहीं जा सकता। अगर नंबर गलत है, तो वह कोई और व्यक्ति है — उसे बदले में जोड़ें।",
  "crew.edit.supervisorLabel": "वे अटेंडेंस दर्ज कर सकते हैं।",
  "crew.edit.supervisorHelp": "सुपरवाइज़र हर दिन टीम में कितने लोग आए यह पुष्टि करते हैं।",
  "crew.edit.errorTitle": "हम ये बदलाव सेव नहीं कर सके",
  "crew.edit.save": "बदलाव सेव करें",
  "crew.edit.documentsTitle": "पहचान दस्तावेज़",
  "crew.edit.documentsChecked": "ऑपरेशंस ने जाँचा",
  "crew.edit.documentsNotChecked": "अभी तक नहीं जाँचा",
  "crew.edit.documentsHint":
    "इस व्यक्ति को कस्टमर के काम पर असाइन करने से पहले ऑपरेशंस इन्हें जाँचता है। Vsolve स्टाफ इनकी जाँच करता है — आप अपनी टीम को खुद जाँचा हुआ नहीं मार्क कर सकते।",

  "crew.gender.notRecorded": "दर्ज नहीं है",
  "crew.gender.man": "पुरुष",
  "crew.gender.woman": "महिला",
  "crew.gender.other": "अन्य",
  "crew.gender.undisclosed": "बताना नहीं चाहते",
  "crew.gender.fieldLabel": "पुरुष या महिला",
  "crew.gender.fieldDescription":
    "इवेंट स्टाफ बुक करने वाले कस्टमर कुछ पुरुष और कुछ महिलाएं मांगते हैं। यह दर्ज होने पर ही Vsolve किसी को उस गिनती में शामिल कर सकता है।",

  "crew.documents.addressProof": "एड्रेस प्रूफ़",
  "crew.documents.policeVerification": "पुलिस वेरिफिकेशन",
  "crew.documents.approved": "स्वीकृत",
  "crew.documents.withOperations": "ऑपरेशंस के पास",
  "crew.documents.rejected": "अस्वीकृत",
  "crew.documents.governmentId": "सरकारी ID",
  "crew.documents.governmentIdHint":
    "आधार, वोटर ID, ड्राइविंग लाइसेंस या पासपोर्ट। असाइन करने से पहले ज़रूरी है।",
  "crew.documents.ifYouHaveIt": "अगर आपके पास है।",
  "crew.documents.tooLarge": "वह फ़ाइल {size} की है। इससे छोटी कोई फ़ाइल भेजें।",
  "crew.documents.cannotSendTitle": "हम वह फ़ाइल नहीं भेज सकते",
  "crew.documents.uploadFailedTitle": "अपलोड पूरा नहीं हुआ",
  "crew.documents.required": "(ज़रूरी)",
  "crew.documents.sending": "भेजा जा रहा है… {percent}%",
  "crew.documents.replace": "बदलें",
  "crew.documents.chooseFile": "फ़ाइल चुनें",
  "crew.upload.expired": "वह अपलोड लिंक इस्तेमाल से पहले ही खत्म हो गया।",
  "crew.upload.storageRefused": "स्टोरेज ने अपलोड मना कर दिया ({status})।",
  "crew.upload.unreachable": "अपलोड स्टोरेज तक नहीं पहुंचा।",
  "crew.upload.cancelled": "अपलोड रद्द हो गया।",
};

export const catalogsByLocale: Record<Locale, Catalog> = {
  "en-IN": en,
  "te-IN": te,
  "hi-IN": hi,
};
