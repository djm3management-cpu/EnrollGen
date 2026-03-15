/**
 * Scholarly reference data for all 66 canonical books.
 * Used by DailyVerse commentary panel.
 *
 * Fields:
 *   testament  – "OT" | "NT"
 *   category   – Genre grouping
 *   author     – Traditional / scholarly attribution
 *   date       – Approximate date of composition
 *   setting    – Historical backdrop
 *   context    – 2-3 sentence synopsis
 *   dss        – Dead Sea Scrolls attestation (OT only)
 *   lxx        – Notable Septuagint differences (OT only)
 *   manuscripts – Key NT manuscripts (NT only)
 *   papyri     – Earliest papyrus witnesses (NT only)
 *   archaeology – Notable archaeological connections
 */

const BIBLE_BOOKS = {
  /* ───────────── PENTATEUCH ───────────── */
  Genesis: {
    testament: "OT",
    category: "Pentateuch / Torah",
    author: "Traditionally Moses; composite sources (JEDP) per documentary hypothesis",
    date: "c. 1400–400 BC (traditional / final redaction)",
    setting: "Creation through Israel's descent into Egypt",
    context:
      "Genesis establishes the foundational narratives of creation, the patriarchal covenants, and God's election of Israel. It traces the line from Adam through Abraham, Isaac, Jacob, and Joseph.",
    dss: "Fragments from at least 24 Genesis scrolls found at Qumran (e.g., 1QGen, 4QGen-a through 4QGen-k). Text largely agrees with the Masoretic tradition with minor orthographic variants.",
    lxx: "The LXX chronologies in Genesis 5 and 11 differ significantly from the MT, adding roughly 1,300 years to pre-Flood genealogies. The LXX also includes Cainan in the post-Flood line (cf. Luke 3:36).",
    archaeology:
      "Nuzi tablets and Mari archives illuminate patriarchal customs (adoption, inheritance). The Ebla tablets reference similar place names and social structures.",
  },
  Exodus: {
    testament: "OT",
    category: "Pentateuch / Torah",
    author: "Traditionally Moses",
    date: "c. 1400–1200 BC (events); final form later",
    setting: "Israel's deliverance from Egypt and covenant at Sinai",
    context:
      "Exodus narrates the liberation from Egyptian slavery, the giving of the Law at Sinai, and the construction of the Tabernacle. It establishes Israel's identity as a covenant nation.",
    dss: "Fragments from ~18 Exodus scrolls at Qumran. 4QpaleoExod-m preserves an expanded text similar to the Samaritan Pentateuch, including material from Deuteronomy inserted into the Exodus narrative.",
    lxx: "The LXX rearranges the Tabernacle instructions (chs. 35–40) significantly from the MT order. Some scholars consider the LXX order more original.",
    archaeology:
      "The Merneptah Stele (c. 1208 BC) provides the earliest extra-biblical reference to 'Israel.' Egyptian records document Semitic slaves and the use of brick-making with straw.",
  },
  Leviticus: {
    testament: "OT",
    category: "Pentateuch / Torah",
    author: "Traditionally Moses; primarily Priestly (P) source",
    date: "c. 1400 BC (traditional)",
    setting: "Laws given at Sinai for priestly worship and holiness",
    context:
      "Leviticus details the sacrificial system, purity laws, the Day of Atonement, and the Holiness Code (chs. 17–26). It bridges Exodus and Numbers at Sinai.",
    dss: "Multiple Leviticus scrolls found at Qumran. 11QpaleoLev is written in paleo-Hebrew script, suggesting the text was considered especially sacred. 4QLev-d fragments show close agreement with MT.",
    lxx: "LXX Leviticus generally follows MT closely. Minor differences in sacrificial terminology and the ordering of some purity regulations appear in certain manuscripts.",
    archaeology:
      "Hittite suzerainty treaties parallel the covenant structure in Leviticus. Ugaritic texts illuminate Canaanite religious practices that Levitical law explicitly forbids.",
  },
  Numbers: {
    testament: "OT",
    category: "Pentateuch / Torah",
    author: "Traditionally Moses",
    date: "c. 1400 BC (traditional)",
    setting: "Israel's wilderness wanderings from Sinai to Moab",
    context:
      "Numbers records the census, the rebellion at Kadesh, the 40 years of wandering, and Israel's arrival at the plains of Moab. It documents both God's faithfulness and Israel's persistent unfaithfulness.",
    dss: "Fragments from ~8 Numbers scrolls at Qumran. 4QNum-b shows some readings agreeing with the Samaritan Pentateuch against the MT, suggesting textual diversity in the Second Temple period.",
    lxx: "LXX Numbers occasionally gives different census totals and has minor expansions. The arrangement of the tribal offerings in ch. 7 shows slight variations.",
    archaeology:
      "The Ketef Hinnom silver scrolls (c. 600 BC) contain the earliest known text of the Priestly Blessing (Num 6:24-26), predating the Dead Sea Scrolls by centuries.",
  },
  Deuteronomy: {
    testament: "OT",
    category: "Pentateuch / Torah",
    author: "Traditionally Moses; core possibly from Josiah's reform (2 Kings 22)",
    date: "c. 1400 BC (traditional) / 7th century BC (critical)",
    setting: "Moses' farewell speeches on the plains of Moab",
    context:
      "Deuteronomy ('second law') presents Moses' final addresses restating the covenant, recounting Israel's history, and urging obedience before entering Canaan.",
    dss: "~30 Deuteronomy scrolls at Qumran — the most attested book alongside Psalms and Isaiah. Some fragments show the Song of Moses (ch. 32) with readings agreeing with LXX against MT.",
    lxx: "In Deut 32:8, LXX reads 'sons of God' (υἱῶν θεοῦ) where MT reads 'sons of Israel.' The Qumran text (4QDeut-j) supports the LXX reading, now widely considered original.",
    archaeology:
      "The structure of Deuteronomy closely parallels Hittite and Assyrian suzerainty treaty forms (preamble, stipulations, blessings/curses), supporting an ancient Near Eastern setting.",
  },

  /* ───────────── HISTORICAL BOOKS ───────────── */
  Joshua: {
    testament: "OT",
    category: "Historical Books",
    author: "Unknown; traditionally Joshua with later additions",
    date: "c. 1400–1200 BC (events)",
    setting: "The conquest and settlement of Canaan",
    context:
      "Joshua narrates the Israelite entry into Canaan, the fall of Jericho, the allotment of tribal territories, and Joshua's farewell covenant renewal at Shechem.",
    dss: "Two Joshua scrolls at Qumran (4QJosh-a, 4QJosh-b). 4QJosh-a places the altar-building episode (cf. Josh 8:30–35) after ch. 4 rather than ch. 8, suggesting a different textual arrangement.",
    lxx: "LXX Joshua is approximately 4–5% shorter than MT. The boundary descriptions and city lists differ in several places, and the order of certain conquest narratives varies.",
    archaeology:
      "Excavations at Jericho (Kenyon, Garstang) show destroyed mudbrick walls, though dating is debated. The Amarna Letters (c. 1350 BC) describe 'Habiru' disruptions in Canaan.",
  },
  Judges: {
    testament: "OT",
    category: "Historical Books",
    author: "Unknown; traditionally Samuel",
    date: "c. 1200–1050 BC (events)",
    setting: "The period between Joshua and the monarchy",
    context:
      "Judges records a cyclical pattern of apostasy, oppression, cry for help, and deliverance through Spirit-empowered judges. It illustrates the chaos of tribal existence without centralized leadership.",
    dss: "Minimal fragments from Qumran (4QJudg-a, 4QJudg-b). The preserved portions align closely with the MT.",
    lxx: "Two main LXX text-types exist for Judges (Codex Vaticanus and Codex Alexandrinus), which differ substantially from each other, representing independent translation traditions.",
    archaeology:
      "The Philistine pentapolis (Ashkelon, Gaza, Ekron, Gath, Ashdod) has been extensively excavated. Tel Miqne (Ekron) reveals the Philistine material culture described in Judges.",
  },
  Ruth: {
    testament: "OT",
    category: "Historical Books",
    author: "Unknown; traditionally Samuel",
    date: "Set in Judges period; written possibly in monarchic period",
    setting: "Bethlehem during the time of the judges",
    context:
      "Ruth tells the story of a Moabite woman's loyalty to her mother-in-law Naomi, her marriage to Boaz through levirate custom, and her place in the lineage of David — and ultimately the Messiah.",
    dss: "Fragments from 4QRuth-a and 4QRuth-b at Qumran. The preserved text aligns closely with the MT.",
    lxx: "LXX Ruth is largely faithful to the MT with only minor stylistic differences. The genealogy at the end (4:18-22) matches both traditions.",
    archaeology:
      "Ancient grain harvesting methods and threshing floor customs described in Ruth are well attested in Near Eastern agricultural archaeology.",
  },
  "1 Samuel": {
    testament: "OT",
    category: "Historical Books",
    author: "Unknown; traditionally Samuel, Nathan, and Gad (cf. 1 Chr 29:29)",
    date: "c. 1050–1010 BC (events)",
    setting: "Transition from judges to monarchy under Saul",
    context:
      "1 Samuel chronicles the birth of Samuel, Israel's demand for a king, Saul's anointing and failure, and David's rise to prominence including his defeat of Goliath.",
    dss: "4QSam-a is one of the most important biblical scrolls from Qumran, preserving a text often closer to the LXX Vorlage than the MT. It includes a paragraph before 1 Sam 11 (Nahash's atrocity) absent from the MT but preserved in Josephus.",
    lxx: "The LXX of 1 Samuel differs extensively from the MT. The Goliath narrative (ch. 17) in the LXX is significantly shorter, omitting ~39 verses present in the MT. Many scholars consider the shorter LXX version more original.",
    archaeology:
      "The Tel Dan Inscription (9th century BC) contains the phrase 'House of David,' the earliest extra-biblical reference to David's dynasty. Khirbet Qeiyafa may be the biblical Sha'arayim.",
  },
  "2 Samuel": {
    testament: "OT",
    category: "Historical Books",
    author: "Unknown; traditionally Nathan and Gad",
    date: "c. 1010–970 BC (events)",
    setting: "David's reign over united Israel",
    context:
      "2 Samuel covers David's kingship — his conquests, the Davidic covenant (ch. 7), the Bathsheba episode, Absalom's rebellion, and the consolidation of the united monarchy.",
    dss: "4QSam-a continues into 2 Samuel with readings frequently agreeing with the LXX against the MT. The text preserves important variant readings in the Bathsheba and Absalom narratives.",
    lxx: "LXX 2 Samuel contains several pluses and minuses compared to MT. In 2 Sam 24:20, the LXX preserves a longer reading about Araunah. Numbers in military counts often differ between MT and LXX.",
    archaeology:
      "The Stepped Stone Structure and Large Stone Structure in Jerusalem's City of David may relate to David's administrative complex. The Mesha Stele (Moabite Stone) references the 'House of David.'",
  },
  "1 Kings": {
    testament: "OT",
    category: "Historical Books",
    author: "Unknown; Jewish tradition attributes to Jeremiah",
    date: "c. 970–850 BC (events)",
    setting: "Solomon's reign and the divided kingdom",
    context:
      "1 Kings narrates Solomon's wisdom, the building of the Temple, the kingdom's division under Rehoboam, and the prophetic ministry of Elijah against Ahab and Jezebel.",
    dss: "Only small fragments of Kings survive at Qumran (5QKgs, 6QKgs). The preserved text is too limited for extensive comparison.",
    lxx: "LXX 1 Kings (= 3 Kingdoms in LXX numbering) has a significantly different arrangement of the Solomon narrative. The account of Jeroboam includes a lengthy addition not in MT.",
    archaeology:
      "Solomon's gates at Hazor, Megiddo, and Gezer match the description in 1 Kings 9:15. The Phoenician-style Temple plan parallels the 'Ain Dara temple in Syria.",
  },
  "2 Kings": {
    testament: "OT",
    category: "Historical Books",
    author: "Unknown; Jewish tradition attributes to Jeremiah",
    date: "c. 850–586 BC (events)",
    setting: "The divided monarchy through the fall of both kingdoms",
    context:
      "2 Kings continues the history of Israel and Judah from Elijah and Elisha through the Assyrian conquest of Israel (722 BC) and the Babylonian destruction of Jerusalem (586 BC).",
    dss: "Minimal Qumran fragments. The text generally agrees with the MT where preserved.",
    lxx: "LXX 2 Kings (= 4 Kingdoms) generally follows the MT more closely than 1 Kings. The account of Hezekiah's reforms shows minor expansions.",
    archaeology:
      "Sennacherib's Prism confirms the siege of Jerusalem under Hezekiah (2 Kings 18–19). The Lachish reliefs depict the Assyrian siege described in the text. The Babylonian Chronicles confirm the fall of Jerusalem.",
  },
  "1 Chronicles": {
    testament: "OT",
    category: "Historical Books",
    author: "Traditionally Ezra; the 'Chronicler'",
    date: "c. 400–350 BC (composition)",
    setting: "Retelling of Israel's history from a post-exilic, priestly perspective",
    context:
      "1 Chronicles opens with genealogies from Adam to David, then retells David's reign emphasizing his preparations for Temple worship and the Levitical orders.",
    dss: "Only one small fragment from Qumran (4QChr). The Chronicler's work was apparently less copied at Qumran than the Deuteronomistic History.",
    lxx: "LXX 1 Chronicles (= 1 Paraleipomenon) closely follows the MT. Name lists show predictable transliteration differences.",
    archaeology:
      "The genealogical records and administrative lists in Chronicles reflect practices well attested in Persian-period archives from Persepolis and Elephantine.",
  },
  "2 Chronicles": {
    testament: "OT",
    category: "Historical Books",
    author: "Traditionally Ezra; the 'Chronicler'",
    date: "c. 400–350 BC (composition)",
    setting: "Solomon through the exile, focused on Judah and the Temple",
    context:
      "2 Chronicles covers Solomon's Temple construction through the Babylonian exile, ending with Cyrus's decree permitting return. It emphasizes Temple worship, reform movements, and faithful kings.",
    dss: "Virtually unattested at Qumran. This absence may reflect the community's preference for other historical traditions.",
    lxx: "LXX 2 Chronicles (= 2 Paraleipomenon) includes minor additions, particularly in the accounts of Hezekiah and Josiah's reforms.",
    archaeology:
      "The LMLK seal impressions found across Judah confirm Hezekiah's administrative preparations described in 2 Chronicles 32. The Siloam Tunnel inscription matches the account of Hezekiah's water project.",
  },
  Ezra: {
    testament: "OT",
    category: "Historical Books",
    author: "Traditionally Ezra",
    date: "c. 458–400 BC (events and composition)",
    setting: "Return from Babylonian exile and restoration of worship",
    context:
      "Ezra records two waves of return from exile: the rebuilding of the Temple under Zerubbabel and the spiritual reforms under Ezra, including dissolution of mixed marriages.",
    dss: "Only one small Ezra fragment from Qumran (4QEzra). The text agrees with MT in its preserved portions.",
    lxx: "LXX Ezra exists in two forms: 1 Esdras (a parallel/expanded version including material from Chronicles) and 2 Esdras (= canonical Ezra-Nehemiah). 1 Esdras preserves the 'Three Guardsmen' story absent from MT.",
    archaeology:
      "The Cyrus Cylinder confirms the Persian policy of allowing exiled peoples to return and rebuild temples, consistent with Ezra 1. The Elephantine papyri reference the Jerusalem Temple.",
  },
  Nehemiah: {
    testament: "OT",
    category: "Historical Books",
    author: "Traditionally Nehemiah; may share authorship with Ezra",
    date: "c. 445–430 BC (events)",
    setting: "Rebuilding Jerusalem's walls under Persian rule",
    context:
      "Nehemiah chronicles the rebuilding of Jerusalem's walls in 52 days despite opposition, followed by Ezra's public reading of the Torah and national covenant renewal.",
    dss: "No Nehemiah manuscripts found at Qumran, which is notable. The book may have circulated as part of the Ezra-Nehemiah unit.",
    lxx: "Part of 2 Esdras in the LXX. The text closely follows the MT. Nehemiah's first-person memoir sections are preserved in both traditions.",
    archaeology:
      "The Elephantine papyri (5th century BC) mention Sanballat the governor of Samaria, confirming Nehemiah's antagonist. Persian-period remains on Jerusalem's eastern ridge align with the described wall route.",
  },
  Esther: {
    testament: "OT",
    category: "Historical Books",
    author: "Unknown",
    date: "c. 480–465 BC (events); composed 4th century BC",
    setting: "The Persian court at Susa under Xerxes (Ahasuerus)",
    context:
      "Esther tells how a Jewish queen and her cousin Mordecai thwarted Haman's plot to annihilate the Jews, leading to the establishment of the feast of Purim. God is never mentioned by name.",
    dss: "No Esther manuscripts found at Qumran — the only canonical book entirely absent from the Dead Sea Scrolls. This may reflect questions about the book's authority in some Jewish circles.",
    lxx: "The LXX version of Esther is dramatically different, containing 107 additional verses (the 'Additions to Esther'). These additions include prayers, letters, and explicit references to God — compensating for the MT's famous silence about the divine.",
    archaeology:
      "Excavations at Susa (modern Shush, Iran) have uncovered the Apadana palace described in Esther 1. Persian administrative records from Persepolis confirm many cultural details in the narrative.",
  },

  /* ───────────── WISDOM / POETRY ───────────── */
  Job: {
    testament: "OT",
    category: "Wisdom Literature",
    author: "Unknown; one of the oldest biblical compositions",
    date: "Patriarchal setting; composition debated (c. 2000–500 BC)",
    setting: "The land of Uz; a righteous man tested by suffering",
    context:
      "Job explores the problem of undeserved suffering through a prologue in heaven, poetic dialogues between Job and his friends, and God's speech from the whirlwind. It challenges simplistic retribution theology.",
    dss: "Multiple Job manuscripts at Qumran including 11QtgJob, an Aramaic Targum of Job — the oldest known Targum. This Aramaic version sometimes paraphrases rather than translates, showing early interpretive traditions.",
    lxx: "LXX Job is approximately 1/6 shorter than the MT, omitting many repetitive sections in the dialogues. Origen noted these differences and added the missing material from Theodotion, marking additions with asterisks.",
    archaeology:
      "The land of Uz is associated with Edom/northern Arabia. Ancient Near Eastern parallels include the Babylonian 'Ludlul bēl nēmeqi' ('I Will Praise the Lord of Wisdom') and the Sumerian 'Man and His God.'",
  },
  Psalms: {
    testament: "OT",
    category: "Wisdom / Poetry",
    author: "David (73), Asaph (12), Korah (11), Solomon (2), Moses (1), others",
    date: "c. 1400–400 BC (spanning nearly a millennium)",
    setting: "Israel's worship, from wilderness to post-exile",
    context:
      "The Psalms comprise Israel's prayer and praise book, organized into five 'books' (1–41, 42–72, 73–89, 90–106, 107–150). They encompass lament, thanksgiving, royal, wisdom, and enthronement themes.",
    dss: "~40 Psalms scrolls at Qumran — the most attested biblical book. The Great Psalms Scroll (11QPsa) arranges Psalms 101–150 in a different order and includes non-canonical compositions (Psalm 151, Psalm 154, Psalm 155). This demonstrates that the Psalter's arrangement was still fluid in the 2nd–1st century BC.",
    lxx: "The LXX Psalter numbers psalms differently from the MT (Pss 9–10 and 114–115 are combined; Pss 116 and 147 are split), creating a numbering offset through most of the collection. LXX includes Psalm 151, a composition about David found also at Qumran.",
    archaeology:
      "The Psalms frequently reference geographic features confirmed by archaeology: the 'stronghold' of Zion, the Gihon Spring, the Valley of Baca. Ancient Near Eastern hymn collections (Egyptian, Mesopotamian) provide structural parallels.",
  },
  Proverbs: {
    testament: "OT",
    category: "Wisdom Literature",
    author: "Primarily Solomon; also Agur (ch. 30), Lemuel (ch. 31), and anonymous sages",
    date: "c. 950 BC (Solomonic core); compiled over centuries",
    setting: "The Israelite royal court and wisdom school tradition",
    context:
      "Proverbs is a collection of pithy wisdom sayings covering practical ethics, the fear of the Lord, and personified Wisdom (chs. 1–9). It represents Israel's contribution to the international wisdom tradition.",
    dss: "Only two small fragments from Qumran (4QProv-a, 4QProv-b). The preserved text agrees with the MT.",
    lxx: "LXX Proverbs rearranges several chapters — the 'Words of Agur' (ch. 30) and 'Words of Lemuel' (ch. 31) are placed differently. The Greek translator also added interpretive expansions and some distinctively Hellenistic vocabulary.",
    archaeology:
      "The Egyptian 'Instruction of Amenemope' (c. 1200 BC) closely parallels Proverbs 22:17–24:22, demonstrating literary borrowing across cultures. Hezekiah's scribes' copying activity (Prov 25:1) fits known scribal practices.",
  },
  Ecclesiastes: {
    testament: "OT",
    category: "Wisdom Literature",
    author: "Traditionally Solomon ('Qoheleth'); linguistic evidence suggests post-exilic composition",
    date: "c. 300–250 BC (most critical scholars); Solomonic attribution is literary device",
    setting: "A sage reflecting on the meaning of life",
    context:
      "Ecclesiastes wrestles with the apparent meaninglessness ('hevel') of life under the sun. Despite its skeptical tone, it concludes with the fear of God as humanity's ultimate duty (12:13).",
    dss: "Two Ecclesiastes fragments at Qumran (4QQoh-a, 4QQoh-b). These are among the earliest witnesses to the text, dated paleographically to c. 175–150 BC, making the book's composition no later than mid-2nd century BC.",
    lxx: "The LXX translation of Ecclesiastes is extremely literal — so literal it is often attributed to Aquila or his school. This wooden approach makes the Greek text sometimes obscure where the Hebrew is ambiguous.",
    archaeology:
      "The Persian and Hellenistic loanwords in Ecclesiastes align with a late composition date. The philosophical themes parallel both Egyptian pessimistic literature ('Dispute of a Man with His Ba') and early Greek philosophy.",
  },
  "Song of Solomon": {
    testament: "OT",
    category: "Wisdom / Poetry",
    author: "Traditionally Solomon; debated",
    date: "c. 950 BC (traditional); possibly later",
    setting: "Love poetry set in pastoral and royal contexts",
    context:
      "The Song of Solomon celebrates romantic and physical love between a bride and bridegroom. Jewish tradition interprets it allegorically as God's love for Israel; Christians as Christ and the Church.",
    dss: "Fragments from 4QCant-a, 4QCant-b, and 6QCant at Qumran. The preserved portions agree with the MT. Its presence at Qumran confirms its status as Scripture before the rabbinic period.",
    lxx: "The LXX closely follows the MT with characteristic Greek stylistic adjustments. Some terms for spices and flora receive culturally adapted translations.",
    archaeology:
      "The flora, fauna, spices, and geographic locations in the Song are botanically and geographically accurate for ancient Palestine. Parallels exist with Egyptian love poetry from the New Kingdom period.",
  },

  /* ───────────── MAJOR PROPHETS ───────────── */
  Isaiah: {
    testament: "OT",
    category: "Major Prophets",
    author: "Isaiah ben Amoz; critical scholars posit 2–3 authors (Proto/Deutero/Trito-Isaiah)",
    date: "c. 740–680 BC (chs. 1–39); 6th century (chs. 40–66 per critical view)",
    setting: "Judah during Assyrian crisis through Babylonian exile (prophetically)",
    context:
      "Isaiah contains judgment oracles against Judah and the nations, the Servant Songs (42, 49, 50, 52–53), and glorious visions of future restoration. It is the most frequently quoted OT book in the NT.",
    dss: "The Great Isaiah Scroll (1QIsa-a) is the most famous Dead Sea Scroll — a complete copy of all 66 chapters, dated c. 125 BC. It is remarkably close to the MT (1,000 years later), with about 2,600 minor variants, most being spelling differences. A second scroll (1QIsa-b) is even closer to the MT. ~21 Isaiah manuscripts total were found at Qumran.",
    lxx: "LXX Isaiah shows significant theological interpretation. In Isa 7:14, LXX uses 'parthenos' (virgin) for Hebrew 'almah' (young woman). The Servant Songs show interpretive expansions. LXX Isa 36–39 closely follows 2 Kings rather than the MT Isaiah text.",
    archaeology:
      "The Sennacherib Prism confirms the Assyrian siege of Jerusalem (Isa 36–37). A bulla (seal impression) reading 'belonging to Isaiah the prophet' was found near the Temple Mount in 2018, though the reading is debated.",
  },
  Jeremiah: {
    testament: "OT",
    category: "Major Prophets",
    author: "Jeremiah, with Baruch as scribe (Jer 36:4)",
    date: "c. 627–580 BC",
    setting: "Judah's final decades before Babylonian exile",
    context:
      "Jeremiah prophesied through Judah's last five kings, witnessing the Temple's destruction in 586 BC. His 'Book of Consolation' (chs. 30–33) promises a New Covenant written on hearts.",
    dss: "Six Jeremiah manuscripts at Qumran. Critically, 4QJer-b and 4QJer-d preserve a shorter text matching the LXX arrangement — providing Hebrew evidence that the shorter LXX version is not simply an abridgment but represents an independent, possibly earlier, textual tradition.",
    lxx: "LXX Jeremiah is approximately 12.5% shorter than the MT (about 2,700 words fewer) and arranges the Oracles Against the Nations in the middle of the book (after 25:13) rather than at the end (chs. 46–51). This is one of the most significant MT-LXX differences in the entire Bible.",
    archaeology:
      "Bullae of Baruch ben Neriah (Jeremiah's scribe) and other figures mentioned in Jeremiah have been found. The Lachish Letters (c. 588 BC) reflect the same crisis Jeremiah describes.",
  },
  Lamentations: {
    testament: "OT",
    category: "Major Prophets",
    author: "Traditionally Jeremiah; anonymous in the text",
    date: "c. 586–550 BC (shortly after Jerusalem's fall)",
    setting: "Mourning the destruction of Jerusalem and the Temple",
    context:
      "Five acrostic poems grieving Jerusalem's destruction. The poet wrestles with God's justice while affirming His faithfulness: 'Great is thy faithfulness' (3:23).",
    dss: "Fragments from 4QLam and 5QLam-a, 5QLam-b at Qumran. Minor textual variants from the MT exist. The acrostic structure is preserved.",
    lxx: "LXX Lamentations closely follows the MT. The acrostic patterns are lost in translation but the content is faithfully preserved. A prefatory note in the LXX attributes the work to Jeremiah.",
    archaeology:
      "Babylonian destruction layers at Jerusalem sites (City of David, Jewish Quarter) corroborate the devastation described in Lamentations. Arrowheads and burnt debris confirm the violence of the siege.",
  },
  Ezekiel: {
    testament: "OT",
    category: "Major Prophets",
    author: "Ezekiel ben Buzi, priest and prophet",
    date: "c. 593–571 BC",
    setting: "Babylonian exile, among the Jewish captives by the Kebar River",
    context:
      "Ezekiel prophesied from exile with dramatic visions (the chariot-throne, the valley of dry bones) and enacted parables. Chs. 40–48 describe a visionary future Temple, inspiring both literal and symbolic interpretations.",
    dss: "Six Ezekiel fragments at Qumran. 4QEzek-a contains portions from chs. 10–11 with minor variants from the MT. The 'Pseudo-Ezekiel' texts (4Q385–4Q388) show Ezekiel's influence on Qumran theology.",
    lxx: "LXX Ezekiel is slightly shorter than the MT but shows a generally reliable translation. Papyrus 967 (pre-Hexaplaric, 2nd–3rd century AD) places chs. 36–39 after ch. 39, suggesting chapter arrangement was still fluid.",
    archaeology:
      "Babylonian ration tablets mention 'Jehoiachin king of Judah' receiving provisions in exile, confirming the deportation context. The Kebar canal has been identified with the Shatt en-Nil near Nippur.",
  },
  Daniel: {
    testament: "OT",
    category: "Major Prophets",
    author: "Traditionally Daniel; critical scholarship dates to Maccabean period",
    date: "c. 605–530 BC (traditional) / c. 167–164 BC (critical)",
    setting: "Babylonian and Persian courts; apocalyptic visions",
    context:
      "Daniel combines court narratives (chs. 1–6) with apocalyptic visions (chs. 7–12). Written partly in Hebrew and partly in Aramaic, it introduces the 'Son of Man' imagery central to NT Christology.",
    dss: "Eight Daniel manuscripts at Qumran (1QDan-a, 1QDan-b, 4QDan-a through 4QDan-e, pap6QDan). The transition from Hebrew to Aramaic at 2:4 is preserved. 4QDan-c, dated c. 125 BC, is significant because if Daniel was composed c. 165 BC, this allows very little time for the book to achieve canonical status.",
    lxx: "Two Greek versions exist: the 'Old Greek' (OG) and Theodotion's revision. Theodotion-Daniel replaced the OG in church usage because the OG was considered too free. The OG of Daniel was so rare it was only rediscovered in a single manuscript (Codex Chisianus) until 1931. The Additions to Daniel (Prayer of Azariah, Susanna, Bel and the Dragon) exist only in Greek.",
    archaeology:
      "The Nabonidus Cylinder confirms aspects of Babylonian history in Daniel. The 'Prayer of Nabonidus' (4Q242) from Qumran parallels Daniel 4's account of the king's madness but attributes it to Nabonidus rather than Nebuchadnezzar.",
  },

  /* ───────────── MINOR PROPHETS (THE TWELVE) ───────────── */
  Hosea: {
    testament: "OT",
    category: "Minor Prophets",
    author: "Hosea ben Beeri",
    date: "c. 750–715 BC",
    setting: "Northern kingdom (Israel) before the Assyrian conquest",
    context:
      "Hosea's marriage to an unfaithful wife (Gomer) dramatizes God's covenant love for wayward Israel. His prophecy blends intense judgment with tender promises of restoration.",
    dss: "Preserved in the Minor Prophets scroll (4QXII). Hosea fragments show close agreement with MT.",
    lxx: "LXX Hosea has some notable differences, particularly in theologically sensitive passages. Hosea 11:1 ('Out of Egypt I called my son') is faithfully preserved in both traditions and cited in Matt 2:15.",
    archaeology:
      "Assyrian annals of Tiglath-Pileser III and Shalmaneser V confirm the political upheaval and tribute payments described in Hosea's historical setting.",
  },
  Joel: {
    testament: "OT",
    category: "Minor Prophets",
    author: "Joel ben Pethuel",
    date: "Debated — pre-exilic (9th century BC) or post-exilic (5th–4th century BC)",
    setting: "Judah, responding to a devastating locust plague",
    context:
      "Joel interprets a locust invasion as a foretaste of the Day of the Lord, calling for national repentance. His promise of the Spirit's outpouring (2:28–32) is cited by Peter at Pentecost (Acts 2:17–21).",
    dss: "Preserved in the Minor Prophets scroll (4QXII). Text agrees with MT in preserved portions.",
    lxx: "LXX Joel closely follows the MT. The order of Joel 3–4 (MT) corresponds to Joel 2:28–3:21 (LXX/English), creating chapter numbering differences that persist in modern translations.",
    archaeology:
      "Locust plagues are well documented in ancient Near Eastern texts. The agricultural devastation described in Joel matches known ecological patterns in the Levant.",
  },
  Amos: {
    testament: "OT",
    category: "Minor Prophets",
    author: "Amos, shepherd of Tekoa",
    date: "c. 760–750 BC",
    setting: "Northern kingdom during Jeroboam II's prosperous reign",
    context:
      "Amos, a Judean shepherd called to prophesy against Israel's northern kingdom, denounces social injustice, religious hypocrisy, and exploitation of the poor. He insists that covenant privilege demands ethical responsibility.",
    dss: "Preserved in the Minor Prophets scroll. Amos fragments at Qumran closely match the MT.",
    lxx: "LXX Amos generally follows the MT. In Amos 9:11-12, the LXX reading ('that the remnant of men may seek the Lord') differs from the MT ('that they may possess the remnant of Edom'), and the LXX version is quoted by James in Acts 15:16-17.",
    archaeology:
      "The earthquake mentioned in Amos 1:1 has been archaeologically confirmed at several sites, including Hazor, with destruction layers dated to c. 760 BC.",
  },
  Obadiah: {
    testament: "OT",
    category: "Minor Prophets",
    author: "Obadiah",
    date: "c. 586 BC (most likely, after Edom's betrayal during Jerusalem's fall)",
    setting: "Oracle against Edom for betraying Judah",
    context:
      "The shortest OT book (21 verses) pronounces judgment on Edom (descendants of Esau) for violence against 'brother Jacob' during Jerusalem's destruction and promises Zion's ultimate triumph.",
    dss: "Included in the Minor Prophets scroll at Qumran. Limited fragments preserve text consistent with the MT.",
    lxx: "LXX Obadiah follows the MT closely. Verses 1–9 share notable parallels with Jeremiah 49:7–22, suggesting literary dependence in one direction.",
    archaeology:
      "Edomite settlements in the Negev and Transjordan have been extensively excavated. After 586 BC, Edomites (later Idumeans) settled in southern Judah, confirming the territorial dynamics described in Obadiah.",
  },
  Jonah: {
    testament: "OT",
    category: "Minor Prophets",
    author: "Unknown; about Jonah ben Amittai (cf. 2 Kings 14:25)",
    date: "8th century BC (setting) / composed later",
    setting: "A prophet sent to Nineveh, capital of Assyria",
    context:
      "Jonah is unique among prophetic books as a narrative about a prophet who flees his commission. The story challenges ethnic exclusivism and reveals God's compassion extending even to Israel's enemies.",
    dss: "Small fragments in the Minor Prophets scroll. Text agrees with the MT.",
    lxx: "LXX Jonah is a straightforward translation. The 'great fish' (kētos mega) in Jon 2:1 becomes the term Jesus uses in Matt 12:40.",
    archaeology:
      "Nineveh's enormous size ('three days' journey,' Jon 3:3) is confirmed by excavations showing walls enclosing ~750 hectares. Assyrian records show periodic religious reforms consistent with Jonah's narrative.",
  },
  Micah: {
    testament: "OT",
    category: "Minor Prophets",
    author: "Micah of Moresheth",
    date: "c. 735–700 BC",
    setting: "Judah during the Assyrian crisis",
    context:
      "Micah prophesied alongside Isaiah, pronouncing judgment on corrupt leaders and false prophets while foretelling the Messiah's birth in Bethlehem (5:2) and calling for justice, mercy, and humility (6:8).",
    dss: "Preserved in Qumran Minor Prophets scrolls. Text follows the MT with minor variants.",
    lxx: "LXX Micah is generally faithful to the MT. Micah 5:2 (MT 5:1) is cited in Matt 2:6 in a form closer to the MT than the LXX.",
    archaeology:
      "Micah's hometown Moresheth-Gath has been identified with Tel Goded/Tell ej-Judeideh in the Shephelah. Sennacherib's siege of Lachish, near Micah's home, is well documented.",
  },
  Nahum: {
    testament: "OT",
    category: "Minor Prophets",
    author: "Nahum the Elkoshite",
    date: "c. 663–612 BC (between the fall of Thebes and the fall of Nineveh)",
    setting: "Oracle against Nineveh (Assyrian capital)",
    context:
      "Nahum prophesies Nineveh's destruction in vivid poetry, portraying God as the avenger of His oppressed people. Where Jonah showed God's mercy to Nineveh, Nahum shows that mercy exhausted by persistent cruelty.",
    dss: "Preserved in Minor Prophets scrolls. The Nahum Pesher (4QpNah) is a sectarian commentary providing important historical references to Hellenistic-period events.",
    lxx: "LXX Nahum follows the MT closely. The acrostic pattern in chapter 1 is partially visible in both Hebrew traditions.",
    archaeology:
      "The fall of Nineveh in 612 BC to Babylonians and Medes is confirmed by the Babylonian Chronicle. Excavations at Nineveh (Kuyunjik) reveal massive destruction layers matching Nahum's prophecy.",
  },
  Habakkuk: {
    testament: "OT",
    category: "Minor Prophets",
    author: "Habakkuk the prophet",
    date: "c. 610–600 BC",
    setting: "Judah facing the Babylonian (Chaldean) threat",
    context:
      "Habakkuk uniquely argues with God about injustice: Why do the wicked prosper? God's answer — that 'the just shall live by faith' (2:4) — becomes foundational in Paul's theology (Rom 1:17, Gal 3:11).",
    dss: "The Habakkuk Pesher (1QpHab) is one of the most important Qumran sectarian texts. It provides a verse-by-verse commentary on chs. 1–2, interpreting Habakkuk as prophesying about the Qumran community's Teacher of Righteousness and his opponents.",
    lxx: "LXX Habakkuk 2:4 reads 'the righteous shall live by my [God's] faithfulness' rather than the MT's 'the righteous shall live by his [own] faith.' Paul's quotation in Romans 1:17 omits the pronoun entirely, creating a third reading.",
    archaeology:
      "The rise of the Neo-Babylonian Empire under Nabopolassar and Nebuchadnezzar II is well documented in Babylonian chronicles, confirming the Chaldean threat Habakkuk describes.",
  },
  Zephaniah: {
    testament: "OT",
    category: "Minor Prophets",
    author: "Zephaniah ben Cushi, great-great-grandson of Hezekiah",
    date: "c. 640–625 BC (during Josiah's early reign)",
    setting: "Judah before Josiah's reforms",
    context:
      "Zephaniah pronounces sweeping Day of the Lord judgment on Judah and surrounding nations, but concludes with a beautiful promise of restoration: 'The LORD thy God in the midst of thee is mighty; he will save' (3:17).",
    dss: "Preserved in Minor Prophets scrolls at Qumran. Text agrees with the MT in preserved portions.",
    lxx: "LXX Zephaniah closely follows the MT. Minor differences exist in the catalog of nations under judgment.",
    archaeology:
      "The religious syncretism condemned by Zephaniah (Baal worship, astral cults, Milcom worship) is confirmed by iconographic and inscriptional evidence from late 7th-century Judah.",
  },
  Haggai: {
    testament: "OT",
    category: "Minor Prophets",
    author: "Haggai the prophet",
    date: "520 BC (precisely dated in the text)",
    setting: "Post-exilic Jerusalem; the Second Temple construction",
    context:
      "Haggai urges the returned exiles to resume building the Temple, which they had neglected for 16 years. His four dated oracles span just four months, showing prophetic precision.",
    dss: "Preserved in the Minor Prophets scroll (4QXII). Text follows the MT.",
    lxx: "LXX Haggai closely follows the MT. Haggai 2:6 ('I will shake the heavens and the earth') is quoted in Hebrews 12:26.",
    archaeology:
      "The chronological references in Haggai correlate with known dates of Darius I's reign. Archaeological evidence from the Temple Mount area shows construction activity consistent with this period.",
  },
  Zechariah: {
    testament: "OT",
    category: "Minor Prophets",
    author: "Zechariah ben Berechiah (chs. 1–8); chs. 9–14 debated (possibly later)",
    date: "c. 520–518 BC (chs. 1–8); chs. 9–14 possibly later",
    setting: "Post-exilic Jerusalem; messianic and apocalyptic visions",
    context:
      "Zechariah combines eight night visions (chs. 1–6), ethical teaching (chs. 7–8), and messianic oracles (chs. 9–14). It is one of the most quoted OT books in the Passion narratives (the thirty pieces of silver, the pierced one, the shepherd struck).",
    dss: "Preserved in Minor Prophets scrolls at Qumran. The text generally follows the MT.",
    lxx: "LXX Zechariah generally follows the MT. Zech 12:10 ('they shall look upon me whom they have pierced') — the LXX reads 'they shall look on me because they mocked/danced' (a different Hebrew root), but the NT (John 19:37) follows the MT reading.",
    archaeology:
      "The Persian provincial administration described in Zechariah is confirmed by bullae and seals from the Yehud province. Coins from this period bear the inscription 'Yehud.'",
  },
  Malachi: {
    testament: "OT",
    category: "Minor Prophets",
    author: "'Malachi' (meaning 'my messenger'); may be a title rather than a name",
    date: "c. 460–430 BC",
    setting: "Post-exilic Judah; Temple rebuilt but spiritual apathy has set in",
    context:
      "Malachi addresses a disillusioned community with six disputations, condemning corrupt priests, faithless marriages, and withholding of tithes. It closes the OT with the promise of Elijah's return — fulfilled in John the Baptist.",
    dss: "Small fragments in the Minor Prophets scroll. Text agrees with the MT.",
    lxx: "LXX Malachi closely follows the MT. The name 'Malachi' is sometimes treated as a title ('my messenger') rather than a proper name in the LXX tradition. Mal 3:1 and 4:5-6 are quoted in the NT Gospels regarding John the Baptist.",
    archaeology:
      "The social conditions Malachi describes (intermarriage, economic hardship, cultic negligence) align with the situation addressed in Ezra-Nehemiah, suggesting contemporaneity.",
  },

  /* ═══════════════════════════════════════════
     NEW TESTAMENT
     ═══════════════════════════════════════════ */
  Matthew: {
    testament: "NT",
    category: "Gospels",
    author: "Traditionally Matthew (Levi); most scholars see an anonymous Jewish-Christian author using Mark",
    date: "c. AD 70–85",
    setting: "Written for a Jewish-Christian audience; emphasizes Jesus as the fulfillment of OT prophecy",
    context:
      "Matthew presents Jesus as the new Moses and promised Messiah, organizing his teaching into five major discourses (Sermon on the Mount, Mission, Parables, Community, Olivet). It contains ~130 OT quotations and allusions.",
    manuscripts:
      "Key uncials: Codex Sinaiticus (א, 4th c.), Codex Vaticanus (B, 4th c.), Codex Bezae (D, 5th c.). Important minuscules include family 1 and family 13.",
    papyri:
      "P1 (3rd c.) — Matt 1. P45 (3rd c., Chester Beatty) — portions of all four Gospels. P64+67 (P. Magdalen, late 2nd c.) — Matt 3, 5, 26. P104 (2nd c.) — Matt 21, one of the earliest NT fragments.",
    archaeology:
      "Capernaum excavations reveal the 1st-century synagogue and 'Peter's house' (an early house church). The Pilate Inscription from Caesarea confirms Pontius Pilate's historical existence and title.",
  },
  Mark: {
    testament: "NT",
    category: "Gospels",
    author: "Traditionally John Mark, companion of Peter; earliest Gospel per majority view",
    date: "c. AD 65–70",
    setting: "Likely written for a Roman/Gentile audience during or shortly before the Jewish War",
    context:
      "Mark presents Jesus as the suffering Servant and Son of God through fast-paced narrative. The 'Messianic Secret' motif and the abrupt ending at 16:8 are distinctive features. Mark 16:9–20 (the 'Longer Ending') is absent from the earliest manuscripts.",
    manuscripts:
      "Codex Sinaiticus and Codex Vaticanus both end Mark at 16:8, without the longer ending. Codex Alexandrinus (A, 5th c.) and Codex Ephraemi (C, 5th c.) include the longer ending.",
    papyri:
      "P45 (3rd c., Chester Beatty) — the earliest extensive papyrus of Mark. P137 (late 2nd/early 3rd c.) — Mark 1, a recently published early fragment.",
    archaeology:
      "The Pool of Siloam and Pool of Bethesda, mentioned in the Gospels, have been archaeologically confirmed. Excavations at the Herodian Temple Mount complex illuminate the setting of Jesus' ministry.",
  },
  Luke: {
    testament: "NT",
    category: "Gospels",
    author: "Traditionally Luke, the physician and companion of Paul (Col 4:14)",
    date: "c. AD 75–85",
    setting: "Written for Theophilus; a Gentile-oriented, orderly account",
    context:
      "Luke emphasizes Jesus' compassion for the marginalized — women, Samaritans, the poor, and Gentiles. It is volume 1 of a two-part work (Luke-Acts) and contains unique parables (Good Samaritan, Prodigal Son).",
    manuscripts:
      "Codex Sinaiticus, Codex Vaticanus, Codex Bezae (D, which has many unique readings in Luke-Acts, sometimes called the 'Western text'). Codex Washingtonianus (W, 5th c.).",
    papyri:
      "P4 (late 2nd/early 3rd c.) — Luke 1–6. P75 (Bodmer XIV-XV, early 3rd c.) — extensive portions of Luke and John; considered the closest papyrus witness to Codex Vaticanus. P45 (3rd c.) — portions of Luke.",
    archaeology:
      "Luke's historical references (census under Quirinius, Lysanias of Abilene, Sergius Paulus) have been largely confirmed. The Politarch inscriptions from Thessalonica validate Luke's use of this title in Acts.",
  },
  John: {
    testament: "NT",
    category: "Gospels",
    author: "Traditionally John the Apostle; the 'Beloved Disciple'; Johannine community",
    date: "c. AD 90–100",
    setting: "Likely Ephesus; written for a mixed audience, possibly facing expulsion from synagogues",
    context:
      "John is the 'spiritual Gospel' (Clement of Alexandria), organized around seven signs and seven 'I AM' statements. It presents the highest Christology, beginning with the Logos hymn (1:1-18). The Pericope Adulterae (7:53–8:11) is absent from the earliest manuscripts.",
    manuscripts:
      "Codex Sinaiticus and Codex Vaticanus (both omit the Pericope Adulterae). Codex Bezae includes it. P66 and P75 are key early witnesses. The Egerton Papyrus (Egerton 2, c. AD 150) contains parallels to John.",
    papyri:
      "P52 (Rylands Papyrus, c. AD 125–175) — John 18:31-33, 37-38; the earliest known NT manuscript fragment. P66 (Bodmer II, c. AD 200) — nearly complete text of John. P75 (Bodmer XIV-XV, early 3rd c.) — extensive portions, very close to Codex Vaticanus.",
    archaeology:
      "The Pool of Bethesda (John 5:2) with its five porticoes has been excavated in Jerusalem. The Pilate Stone from Caesarea confirms his title. The synagogue inscription from Theodotus in Jerusalem illuminates the Johannine setting.",
  },
  Acts: {
    testament: "NT",
    category: "Historical",
    author: "Traditionally Luke (volume 2 of Luke-Acts)",
    date: "c. AD 80–90",
    setting: "The spread of the early church from Jerusalem to Rome",
    context:
      "Acts narrates the church's expansion in concentric circles: Jerusalem → Judea → Samaria → the ends of the earth (1:8). It follows the ministries of Peter (chs. 1–12) and Paul (chs. 13–28).",
    manuscripts:
      "Two major text-types: the Alexandrian (Sinaiticus, Vaticanus) and the Western (Codex Bezae, which is ~8.5% longer in Acts with many unique readings). The Western text of Acts is a major text-critical problem.",
    papyri:
      "P45 (3rd c.) — portions of Acts. P29 (3rd c.) — Acts 26. P48 (3rd c.) — Acts 23. P53 (3rd c.) — Acts 9-10. P91 (3rd c.) — Acts 2.",
    archaeology:
      "The Gallio Inscription from Delphi dates Paul's stay in Corinth to c. AD 51–52, providing a key chronological anchor. The Erastus Inscription from Corinth may reference Rom 16:23. Luke's detailed geographic and political terminology has been extensively verified.",
  },
  Romans: {
    testament: "NT",
    category: "Pauline Epistles",
    author: "Paul the Apostle, via Tertius as amanuensis (16:22)",
    date: "c. AD 57 (from Corinth)",
    setting: "Written to a church Paul had not yet visited, preparing for his arrival",
    context:
      "Romans is Paul's most systematic theological letter, expounding justification by faith (chs. 1–8), Israel's role in salvation history (chs. 9–11), and practical ethics (chs. 12–16). Chapter 16's doxology placement varies in manuscripts.",
    manuscripts:
      "Codex Sinaiticus, Vaticanus, Alexandrinus. P46 is the earliest witness. The doxology (16:25-27) appears after 14:23 in some manuscripts and after 15:33 in others, suggesting Romans circulated in different-length editions.",
    papyri:
      "P46 (Chester Beatty II, c. AD 200) — the earliest extensive Pauline manuscript, containing most of Romans. It places the doxology after chapter 15, supporting the theory of multiple editions.",
    archaeology:
      "The Erastus Inscription from Corinth ('Erastus in return for his aedileship laid [this pavement] at his own expense') may refer to the Erastus of Rom 16:23.",
  },
  "1 Corinthians": {
    testament: "NT",
    category: "Pauline Epistles",
    author: "Paul the Apostle",
    date: "c. AD 55 (from Ephesus)",
    setting: "Addressing divisions and moral problems in the Corinthian church",
    context:
      "Paul responds to reports and questions from the Corinthian congregation, addressing factions, sexual immorality, lawsuits, marriage, idol food, worship order, spiritual gifts, and the resurrection. Chapter 13 (the 'love chapter') is among the most recognized passages in the Bible.",
    manuscripts:
      "Codex Sinaiticus, Vaticanus, Alexandrinus, Claromontanus (D). In 14:34-35 (women silent in churches), some Western manuscripts place these verses after v. 40, leading some scholars to consider them a later interpolation.",
    papyri:
      "P46 (c. AD 200) — extensive portions. P15 (3rd c.) — 1 Cor 7-8. P11 (7th c.) — 1 Cor 1-7.",
    archaeology:
      "Excavations at Corinth reveal the bema (judgment seat, cf. Acts 18:12), the agora, and the meat market (makellon, cf. 1 Cor 10:25). Temples to various deities confirm the polytheistic environment Paul addressed.",
  },
  "2 Corinthians": {
    testament: "NT",
    category: "Pauline Epistles",
    author: "Paul the Apostle",
    date: "c. AD 55–56",
    setting: "Defending his apostleship and reconciling with the Corinthian church",
    context:
      "2 Corinthians is Paul's most personal and emotional letter. Many scholars see it as a composite of 2+ letters (chs. 1–9 and 10–13). Paul's 'thorn in the flesh' (12:7) and his catalog of sufferings (11:23-29) are famous passages.",
    manuscripts:
      "Codex Sinaiticus, Vaticanus, Claromontanus (D). The apparent tonal shift between chs. 9 and 10 has led to partition theories, though all manuscripts preserve the letter as a unity.",
    papyri:
      "P46 (c. AD 200) — extensive portions. P117 (3rd c.) — 2 Cor 7.",
    archaeology:
      "Paul's reference to an 'ethnarch under King Aretas' guarding Damascus (11:32) is confirmed by Nabataean political presence in Damascus during this period.",
  },
  Galatians: {
    testament: "NT",
    category: "Pauline Epistles",
    author: "Paul the Apostle",
    date: "c. AD 48–55 (dating depends on North vs. South Galatian theories)",
    setting: "Combating Judaizers who demanded Gentile circumcision",
    context:
      "Galatians is Paul's passionate defense of justification by faith apart from works of the Law. Luther called it 'my epistle' and it became foundational for the Reformation. The allegory of Hagar and Sarah (ch. 4) and the fruit of the Spirit (5:22-23) are key passages.",
    manuscripts:
      "P46 (c. AD 200) is the earliest witness. Codex Sinaiticus, Vaticanus. The text is relatively stable across manuscripts.",
    papyri:
      "P46 (c. AD 200) — nearly complete text of Galatians. P51 (c. AD 400) — Gal 1.",
    archaeology:
      "Inscriptions from Pisidian Antioch and other South Galatian cities illuminate the civic context of Paul's mission in Acts 13–14.",
  },
  Ephesians: {
    testament: "NT",
    category: "Pauline Epistles",
    author: "Paul the Apostle (debated; some scholars consider it deutero-Pauline)",
    date: "c. AD 60–62 (if Pauline, from Roman imprisonment)",
    setting: "A circular letter on the nature and unity of the church",
    context:
      "Ephesians presents a cosmic vision of God's plan to unite all things in Christ. It describes the church as Christ's body and temple, and includes the 'armor of God' passage (6:10-20) and the household code (5:21–6:9).",
    manuscripts:
      "P46 (c. AD 200) is the earliest witness. Notably, the words 'in Ephesus' (1:1) are absent from P46, Sinaiticus (original hand), and Vaticanus, supporting the circular letter theory.",
    papyri:
      "P46 (c. AD 200) — complete text. P49 (3rd c.) — Eph 4-5.",
    archaeology:
      "Extensive excavations at Ephesus reveal the great theater (cf. Acts 19), the Temple of Artemis, and numerous inscriptions. The city's importance as a center of magic and religion illuminates the spiritual warfare imagery.",
  },
  Philippians: {
    testament: "NT",
    category: "Pauline Epistles",
    author: "Paul the Apostle (with Timothy)",
    date: "c. AD 61–62 (from Roman imprisonment, or possibly Ephesian imprisonment c. AD 55)",
    setting: "A letter of joy and thanksgiving from prison",
    context:
      "Philippians is Paul's warmest letter, written to thank the Philippians for their partnership and financial support. The Christ hymn (2:6-11) is one of the earliest Christological statements, possibly a pre-Pauline composition.",
    manuscripts:
      "P46 (c. AD 200), Codex Sinaiticus, Vaticanus. The text is well preserved with few significant variants.",
    papyri:
      "P46 (c. AD 200) — complete text. P16 (3rd–4th c.) — Phil 3-4.",
    archaeology:
      "Excavations at Philippi reveal the forum, the Via Egnatia, and a 'place of prayer' by the river (cf. Acts 16:13). Latin inscriptions confirm the city's status as a Roman colony.",
  },
  Colossians: {
    testament: "NT",
    category: "Pauline Epistles",
    author: "Paul the Apostle (debated; some consider deutero-Pauline)",
    date: "c. AD 60–62 (from imprisonment)",
    setting: "Combating a syncretistic 'philosophy' threatening the Colossian church",
    context:
      "Colossians presents Christ as supreme over all creation and spiritual powers (1:15-20, the 'Colossian hymn'). Paul counters angel worship, ascetic practices, and mystical visions with the sufficiency of Christ.",
    manuscripts:
      "P46 (c. AD 200), Codex Sinaiticus, Vaticanus, Claromontanus. The text is relatively stable.",
    papyri:
      "P46 (c. AD 200) — nearly complete text.",
    archaeology:
      "Colossae remains largely unexcavated, but nearby Laodicea and Hierapolis have been extensively studied. The Lycus Valley's seismic activity and mineral-rich hot springs illuminate references in the letter.",
  },
  "1 Thessalonians": {
    testament: "NT",
    category: "Pauline Epistles",
    author: "Paul the Apostle (with Silvanus and Timothy)",
    date: "c. AD 50–51 — likely the earliest Pauline letter and possibly the earliest NT document",
    setting: "Written from Corinth to encourage a young church under persecution",
    context:
      "1 Thessalonians addresses concerns about believers who have died before Christ's return (4:13-18) and the timing of the Day of the Lord (5:1-11). Paul's affection for this church is palpable throughout.",
    manuscripts:
      "P46 does not contain the Thessalonian letters (the manuscript may have lacked space). Codex Sinaiticus, Vaticanus, Alexandrinus are the primary witnesses.",
    papyri:
      "P30 (3rd c.) — 1 Thess 4-5; 2 Thess 1. P65 (3rd c.) — 1 Thess 1-2.",
    archaeology:
      "Politarch inscriptions from Thessalonica confirm Luke's use of this title (Acts 17:6-8). The city's position on the Via Egnatia facilitated rapid gospel spread as Paul describes.",
  },
  "2 Thessalonians": {
    testament: "NT",
    category: "Pauline Epistles",
    author: "Paul the Apostle (debated; some consider pseudepigraphal)",
    date: "c. AD 51–52 (if Pauline)",
    setting: "Correcting misunderstandings about the Day of the Lord",
    context:
      "2 Thessalonians clarifies that the Day of the Lord has not yet come, describing the 'man of lawlessness' who must appear first (2:1-12). Paul also addresses idleness in the community.",
    manuscripts:
      "Codex Sinaiticus, Vaticanus, Alexandrinus. P30 (3rd c.) contains portions of both Thessalonian letters.",
    papyri:
      "P30 (3rd c.) — 2 Thess 1. P92 (3rd–4th c.) — 2 Thess 1.",
    archaeology:
      "Imperial cult inscriptions from Thessalonica illuminate the political backdrop of Paul's language about a coming ruler who demands divine worship.",
  },
  "1 Timothy": {
    testament: "NT",
    category: "Pastoral Epistles",
    author: "Traditionally Paul; many scholars consider pseudepigraphal due to vocabulary, style, and ecclesiology",
    date: "c. AD 62–67 (if Pauline) / c. AD 80–100 (if pseudepigraphal)",
    setting: "Instructions for church organization in Ephesus",
    context:
      "1 Timothy provides guidance on church leadership (bishops/deacons), combating false teaching, public worship, and pastoral care. The Pastoral Epistles contain 306 words not found elsewhere in Paul's letters.",
    manuscripts:
      "Codex Sinaiticus, Alexandrinus (Vaticanus is missing the Pastorals due to damage). Codex Claromontanus (D). P46 does not include the Pastoral Epistles.",
    papyri:
      "No early papyri specifically for 1 Timothy alone. The absence of the Pastorals from P46 has been debated — was it due to space constraints or because the collector's Pauline corpus did not yet include them?",
    archaeology:
      "The Ephesian context of 1 Timothy is illuminated by excavations revealing the cult of Artemis, guilds, and civic structures Paul's instructions address.",
  },
  "2 Timothy": {
    testament: "NT",
    category: "Pastoral Epistles",
    author: "Traditionally Paul (his final letter); debated",
    date: "c. AD 67 (if Pauline, shortly before martyrdom)",
    setting: "Paul's final charge to Timothy from a Roman prison",
    context:
      "2 Timothy reads as Paul's testament, urging Timothy to endure suffering, guard the deposit of faith, and preach the Word 'in season and out of season' (4:2). Paul's statement 'I have fought the good fight' (4:7) is his farewell.",
    manuscripts:
      "Codex Sinaiticus, Alexandrinus, Claromontanus. The text is relatively stable. The Muratorian Fragment (c. AD 170–200) lists the Pastorals as Pauline.",
    papyri:
      "No early papyrus witnesses specifically for 2 Timothy.",
    archaeology:
      "The Mamertine Prison in Rome is traditionally associated with Paul's final imprisonment. Roman legal procedures described in 2 Timothy (the 'first defense,' 4:16) match known practices.",
  },
  Titus: {
    testament: "NT",
    category: "Pastoral Epistles",
    author: "Traditionally Paul; debated like the other Pastorals",
    date: "c. AD 63–67 (if Pauline)",
    setting: "Instructions for church organization in Crete",
    context:
      "Titus addresses elder qualifications, sound doctrine vs. false teachers, and Christian conduct in society. Paul quotes the Cretan poet Epimenides (1:12), one of several pagan citations in the NT.",
    manuscripts:
      "Codex Sinaiticus, Alexandrinus, Claromontanus. The text is well preserved.",
    papyri:
      "P32 (c. AD 200) — Titus 1-2; one of the earliest witnesses to any Pastoral Epistle, significant for debates about the Pastorals' early circulation.",
    archaeology:
      "Archaeological survey of Crete confirms the multiple city structure Paul references. Gortyn, the provincial capital, has produced important Roman-period inscriptions.",
  },
  Philemon: {
    testament: "NT",
    category: "Pauline Epistles",
    author: "Paul the Apostle",
    date: "c. AD 60–62 (from imprisonment, same time as Colossians)",
    setting: "A personal letter about Onesimus, a runaway slave",
    context:
      "Paul's shortest letter appeals to Philemon to receive back Onesimus 'no longer as a slave, but… as a brother beloved' (v. 16). It provides a window into early Christian social ethics and the subversion of Roman slavery.",
    manuscripts:
      "P87 (3rd c.) is the earliest witness. Codex Sinaiticus, Vaticanus, Alexandrinus.",
    papyri:
      "P87 (3rd c.) — Philemon 13-15, 24-25. P46 does not include Philemon (space or scope of collection).",
    archaeology:
      "Roman laws on fugitive slaves (the Lex Fufia Caninia and senatus consultum Silanianum) illuminate the legal background of Paul's appeal. Colossae's position in the Lycus Valley places Philemon in a specific social world.",
  },
  Hebrews: {
    testament: "NT",
    category: "General Epistles",
    author: "Unknown — Paul, Apollos, Barnabas, Priscilla, and Luke have all been suggested. Origen (3rd c.): 'Who wrote Hebrews, God alone knows.'",
    date: "c. AD 60–90 (before or after the Temple's destruction is debated)",
    setting: "Written to Jewish Christians tempted to return to Judaism",
    context:
      "Hebrews argues for Christ's superiority over angels, Moses, the Levitical priesthood, and the old covenant. The Melchizedek priesthood (chs. 5–7), the new covenant (ch. 8), and the 'Hall of Faith' (ch. 11) are central themes.",
    manuscripts:
      "P46 (c. AD 200) — places Hebrews after Romans in the Pauline corpus. Codex Sinaiticus, Vaticanus, Alexandrinus. The letter's placement varied in early canon lists — Eastern churches placed it among Paul's letters; Western churches were more hesitant.",
    papyri:
      "P46 (c. AD 200) — extensive text, the earliest substantial witness. P12 (3rd c.) — Heb 1. P13 (3rd–4th c.) — Heb 2-5, 10-12. P17 (4th c.) — Heb 9.",
    archaeology:
      "The detailed Tabernacle and priestly descriptions in Hebrews align with archaeological understanding of Second Temple practices. The Copper Scroll from Qumran lists Temple treasures, illuminating the priestly context.",
  },
  James: {
    testament: "NT",
    category: "General Epistles",
    author: "Traditionally James, the brother of Jesus; debated",
    date: "c. AD 45–62 (if by James the Just) / possibly later",
    setting: "Practical wisdom for Jewish Christians in the diaspora",
    context:
      "James emphasizes that genuine faith produces works, addressing partiality, taming the tongue, worldliness, and care for the poor. Luther famously called it an 'epistle of straw' (which he later nuanced), seeing tension with Pauline justification by faith.",
    manuscripts:
      "P20 (3rd c.) — the earliest witness. Codex Sinaiticus, Vaticanus, Alexandrinus. Codex Corbeiensis (ff) preserves an early Latin translation.",
    papyri:
      "P20 (3rd c.) — James 2-3. P23 (3rd c.) — James 1. P100 (3rd–4th c.) — James 3-5.",
    archaeology:
      "The James Ossuary ('James, son of Joseph, brother of Jesus') sparked major debate when published in 2002. Its authenticity remains contested, but if genuine, it would be the earliest archaeological artifact connected to Jesus' family.",
  },
  "1 Peter": {
    testament: "NT",
    category: "General Epistles",
    author: "Traditionally Peter, via Silvanus as amanuensis (5:12); the polished Greek leads some to doubt direct Petrine authorship",
    date: "c. AD 62–67",
    setting: "Encouraging persecuted Christians in Asia Minor (modern Turkey)",
    context:
      "1 Peter addresses suffering and persecution with theology of hope. Believers are 'living stones' (2:5), 'a royal priesthood' (2:9), called to endure as Christ endured. The reference to 'Babylon' (5:13) is widely understood as Rome.",
    manuscripts:
      "P72 (3rd–4th c.) — the earliest extensive witness, containing the complete text. Codex Sinaiticus, Vaticanus, Alexandrinus.",
    papyri:
      "P72 (Bodmer VII-VIII, 3rd–4th c.) — complete text of 1-2 Peter and Jude. P81 (4th c.) — 1 Peter 2-3.",
    archaeology:
      "The five Roman provinces addressed in 1 Peter 1:1 (Pontus, Galatia, Cappadocia, Asia, Bithynia) are well attested in Roman administrative records. Evidence of early Christian communities in these regions exists from the 2nd century (Pliny's letter to Trajan).",
  },
  "2 Peter": {
    testament: "NT",
    category: "General Epistles",
    author: "Claims to be by Simon Peter (1:1); widely considered the latest NT document. Most scholars view it as pseudepigraphal",
    date: "c. AD 80–130",
    setting: "Combating false teachers who deny Christ's return",
    context:
      "2 Peter defends the reality of Christ's second coming against scoffers, incorporates most of Jude, and refers to Paul's letters as 'Scripture' (3:15-16) — one of the earliest such recognitions. Its canonicity was the most disputed of any NT book.",
    manuscripts:
      "P72 (3rd–4th c.) — the earliest witness. Codex Sinaiticus, Vaticanus, Alexandrinus. Notably absent from the Muratorian Fragment and questioned by Eusebius (as 'disputed').",
    papyri:
      "P72 (Bodmer VII-VIII, 3rd–4th c.) — complete text. This is the only early papyrus witness, making 2 Peter the least-attested NT book in papyrus evidence.",
    archaeology:
      "The reference to 'the holy mountain' (1:18) and the Transfiguration account connect to sites traditionally identified with Mt. Hermon or Mt. Tabor.",
  },
  "1 John": {
    testament: "NT",
    category: "Johannine Epistles",
    author: "Traditionally John the Apostle; 'the Elder' of the Johannine community",
    date: "c. AD 90–100",
    setting: "Addressing a schism in the Johannine community over Christology",
    context:
      "1 John combats proto-Gnostic denial that Jesus came 'in the flesh.' It establishes tests of authentic faith: right belief in Christ, love for fellow believers, and obedience. The Comma Johanneum (5:7-8, Trinitarian formula) is absent from all Greek manuscripts before the 16th century.",
    manuscripts:
      "The Comma Johanneum ('the Father, the Word, and the Holy Spirit') in 5:7-8 is found only in late Latin manuscripts and was not in the original Greek. Erasmus added it to the Greek text under pressure, and it entered the KJV from the Textus Receptus. Codex Sinaiticus, Vaticanus, and all early Greek witnesses omit it.",
    papyri:
      "P9 (3rd c.) — 1 John 4. No extensive early papyrus witnesses.",
    archaeology:
      "The Johannine community's setting in Ephesus is supported by early church tradition (Irenaeus, Polycrates) and archaeological evidence of early Christian presence in the city.",
  },
  "2 John": {
    testament: "NT",
    category: "Johannine Epistles",
    author: "'The Elder'; traditionally identified with John the Apostle",
    date: "c. AD 90–100",
    setting: "A brief letter warning against false teachers",
    context:
      "The shortest NT book (13 verses), 2 John warns an 'elect lady' (possibly a house church) against receiving itinerant teachers who deny Christ's incarnation. It is a practical application of 1 John's theology.",
    manuscripts:
      "Codex Sinaiticus, Vaticanus (partially damaged here), Alexandrinus. 2–3 John and Jude sometimes appear in different canonical orders in manuscript traditions.",
    papyri:
      "No early papyrus witnesses for 2 John alone. Its brevity meant it was less frequently copied independently.",
    archaeology:
      "The letter reflects the house-church structure of early Christianity, well attested archaeologically in domestic spaces adapted for worship (Dura-Europos house church, c. AD 235, is the earliest known).",
  },
  "3 John": {
    testament: "NT",
    category: "Johannine Epistles",
    author: "'The Elder'; traditionally John the Apostle",
    date: "c. AD 90–100",
    setting: "A personal letter about hospitality and church authority",
    context:
      "3 John commends Gaius for hospitality to traveling missionaries, condemns Diotrephes for refusing them, and recommends Demetrius. It provides a rare window into early church politics and the tension between apostolic authority and local leadership.",
    manuscripts:
      "Codex Sinaiticus, Alexandrinus. Codex Vaticanus is damaged at this point. The letter's canonicity was questioned by some early writers (Eusebius lists it among 'disputed' books).",
    papyri:
      "No early papyrus witnesses for 3 John.",
    archaeology:
      "The hospitality network described in 3 John matches what we know of early Christian mission: itinerant teachers relied on local patrons, a practice also attested in the Didache (c. AD 100).",
  },
  Jude: {
    testament: "NT",
    category: "General Epistles",
    author: "Jude, brother of James (and thus of Jesus); debated",
    date: "c. AD 65–80",
    setting: "Warning against false teachers who pervert grace into licentiousness",
    context:
      "Jude draws on Jewish traditions not found in the OT canon, quoting 1 Enoch 1:9 (v. 14-15) and alluding to the Assumption of Moses (v. 9). Most of Jude is incorporated into 2 Peter 2. Its use of pseudepigraphal literature was controversial in early canonization discussions.",
    manuscripts:
      "P72 (3rd–4th c.) — the earliest and most complete witness. P78 (3rd–4th c.) — Jude 4-5, 7-8. Codex Sinaiticus, Vaticanus, Alexandrinus.",
    papyri:
      "P72 (Bodmer VII-VIII) — complete text. P78 — small fragment. Jude's use of 1 Enoch is preserved faithfully in all manuscript traditions, showing no attempt to remove the quotation.",
    archaeology:
      "The family of Jesus in Nazareth is attested by early traditions. Hegesippus (2nd c.) records that grandsons of Jude were brought before Domitian as Davidic descendants but released as harmless peasants.",
  },
  Revelation: {
    testament: "NT",
    category: "Apocalyptic / Prophecy",
    author: "John (1:1, 4) — traditionally the Apostle; possibly 'John the Elder,' a distinct figure",
    date: "c. AD 95 (under Domitian); some argue for c. AD 68 (under Nero)",
    setting: "Written from exile on Patmos to seven churches in Asia Minor",
    context:
      "Revelation is Christian apocalyptic prophecy drawing heavily on Daniel, Ezekiel, and Zechariah. It reveals the cosmic conflict between God and evil, the fall of 'Babylon' (Rome?), the millennium, and the New Jerusalem. Its symbolism (666, the four horsemen, the Lamb) has generated centuries of interpretive debate.",
    manuscripts:
      "Codex Sinaiticus (our earliest complete uncial), Codex Alexandrinus (generally considered the best uncial for Revelation), Codex Ephraemi (C, partially preserved). Revelation has the most textual variants of any NT book — Andreas of Caesarea's commentary (6th c.) preserves an important textual tradition. The number of the beast varies: 666 (most manuscripts) vs. 616 (P115, Codex Ephraemi, noted by Irenaeus).",
    papyri:
      "P47 (3rd c., Chester Beatty) — Rev 9-17, the most substantial early papyrus. P98 (2nd c.) — Rev 1:13-2:1, possibly the earliest Revelation papyrus. P115 (3rd–4th c.) — notably reads '616' instead of '666' for the number of the beast in Rev 13:18.",
    archaeology:
      "The seven cities of Revelation 2–3 have been extensively excavated: Ephesus, Smyrna, Pergamum, Thyatira, Sardis, Philadelphia, Laodicea. Each letter contains allusions to the specific city's geography, economy, and religious life confirmed by archaeology (e.g., Laodicea's lukewarm water, Pergamum's altar of Zeus, Sardis's reputation for complacency).",
  },
};

/* ── Helpers ── */

/**
 * Extract the book name from a reference like "Philippians 4:13"
 * Handles numbered books: "1 Corinthians 13:4", "2 Kings 5:1"
 */
export function extractBook(reference) {
  if (!reference) return null;
  const ref = reference.trim();
  // Match: optional number+space, then book name (letters/spaces), then chapter:verse
  const m = ref.match(/^(\d?\s*[A-Za-z][A-Za-z\s]+?)(?:\s+\d|$)/);
  if (!m) return null;
  return m[1].trim();
}

/**
 * Look up scholarly data for a given reference.
 * Returns the book data object or null.
 */
export function getBookData(reference) {
  const book = extractBook(reference);
  if (!book) return null;

  // Direct match
  if (BIBLE_BOOKS[book]) return BIBLE_BOOKS[book];

  // Try case-insensitive match
  const lower = book.toLowerCase();
  for (const [key, val] of Object.entries(BIBLE_BOOKS)) {
    if (key.toLowerCase() === lower) return val;
  }

  // Try partial match (e.g., "Psalms" → "Psalms", "Psalm" → "Psalms")
  for (const [key, val] of Object.entries(BIBLE_BOOKS)) {
    if (
      key.toLowerCase().startsWith(lower) ||
      lower.startsWith(key.toLowerCase())
    ) {
      return val;
    }
  }

  return null;
}

export default BIBLE_BOOKS;
