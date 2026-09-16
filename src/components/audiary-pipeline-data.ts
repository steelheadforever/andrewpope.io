// Data behind the Audiary pipeline figure (AudiaryPipeline.astro).
//
// Tags, rule verdicts, routing modes, the prompt and the model's answer are
// real output: the production HeteronymResolver.swift + HeteronymPrompt.swift +
// HeteronymRouting.json, and Apple Foundation Models, run on macOS 26.6.2
// (2026-09-13). Non-heteronym phonemes are Misaki us_gold lexicon entries.
// Stats come from the Audiary code and the 2.0 eval write-up.

export type HitKey = "bass" | "bow" | "read";

export interface Reading {
  ipa: string;
  rhyme: string;
  sense: string;
}

export interface Hit {
  word: HitKey;
  tag: string; // NLTagger lexical class
  rule: string; // what the rules pass keyed on
  rules: Reading; // the rules' reading
  model?: Reading; // the model's answer, when it is asked
  rulesWrong?: boolean;
  confident: boolean;
  mode: "rules" | "silent" | "model"; // HeteronymRouting.json
  routeNote: string;
  askModel: boolean; // routing.wantsModel(candidate)
}

export const SENTENCE = "The bass player took a bow after she read the letter.";

export const TOKENS: { w: string; tag: string; ipa: string; hit?: HitKey }[] = [
  { w: "The", tag: "Determiner", ipa: "ði" },
  { w: "bass", tag: "Noun", ipa: "bˈæs", hit: "bass" },
  { w: "player", tag: "Noun", ipa: "plˈAəɹ" },
  { w: "took", tag: "Verb", ipa: "tˈʊk" },
  { w: "a", tag: "Determiner", ipa: "A" },
  { w: "bow", tag: "Noun", ipa: "bˈO", hit: "bow" },
  { w: "after", tag: "Preposition", ipa: "ˈæftəɹ" },
  { w: "she", tag: "Pronoun", ipa: "ʃi" },
  { w: "read", tag: "Verb", ipa: "ɹˈid", hit: "read" },
  { w: "the", tag: "Determiner", ipa: "ði" },
  { w: "letter", tag: "Noun", ipa: "lˈɛɾəɹ" },
];

export const HITS: Hit[] = [
  {
    word: "bass",
    tag: "Noun",
    rule: "none (tagger only)",
    rules: { ipa: "bˈæs", rhyme: "rhymes with mass", sense: "the fish" },
    model: { ipa: "bˈAs", rhyme: "rhymes with base", sense: "music" },
    rulesWrong: true,
    confident: false,
    mode: "silent",
    routeNote: "rules unsure",
    askModel: true,
  },
  {
    word: "bow",
    tag: "Noun",
    rule: "“took a ___”: take a bow",
    rules: { ipa: "bˈW", rhyme: "rhymes with cow", sense: "to bend forward" },
    confident: true,
    mode: "silent",
    routeNote: "rules confident",
    askModel: false,
  },
  {
    word: "read",
    tag: "Verb",
    rule: "past context: “took”, no present markers",
    rules: { ipa: "ɹˈɛd", rhyme: "rhymes with red", sense: "past tense" },
    confident: true,
    mode: "rules",
    routeNote: "never ask for this word",
    askModel: false,
  },
];

export const PROMPT = {
  text: `Sentence: "The [[bass]] player took a bow after she read the letter."
Target word: [[bass]]
Options:
- music: the low range, voice, or instrument - 'bass guitar', 'bass player' (rhymes with base)
- the fish - 'caught a bass' (rhymes with mass)`,
  options: [
    { gloss: "music: the low range, voice, or instrument - 'bass guitar', 'bass player' (rhymes with base)", ipa: "bˈAs", chosen: true },
    { gloss: "the fish - 'caught a bass' (rhymes with mass)", ipa: "bˈæs", chosen: false },
  ],
  ms: 286, // warm session, Mac; ~⅓ s on iPhone 16 Pro
};

export const STATS = {
  tableWords: 638,
  firstChars: 90,
  maxChars: 220,
  routing: { rules: 89, silent: 25, model: 18 }, // of the 132 benchmark words
  refusedPct: 4,
  phonemeCap: 500,
  lookahead: 40,
  lookaheadMin: 10,
  callSec: 0.3,
  utteranceSec: 15,
  callsPerHour: 20,
};

export const STEPS = [
  { id: "text", name: "Text", title: "Text becomes utterances", summary: "The document is split at sentence ends and grouped into utterances of about fifteen seconds of audio. Each is handled on its own from here." },
  { id: "scan", name: "Scan", title: "A cheap first look", summary: "A lowercase substring check against the heteronym table. Most utterances have no hit and skip everything below." },
  { id: "tag", name: "Tag", title: "Part of speech", summary: "Apple's NLTagger labels each word noun, verb, adjective or adverb. It can't say which tense, or which meaning." },
  { id: "rules", name: "Rules", title: "The rules go first", summary: "Hand-written rules read the neighbours: an auxiliary means a participle, “take a bow” means the gesture, past-tense words nearby mean past. Where nothing fires, the tagger's guess stands and the verdict is unsure." },
  { id: "route", name: "Route", title: "Who gets the last word", summary: "A per-word routing table, tuned on training data, decides whether the rules' reading stands or the on-device model is asked." },
  { id: "model", name: "Model", title: "A multiple-choice question", summary: "The model sees one sentence with the word in brackets and plain-English meanings to pick from. Its output is constrained to one of those options, then mapped back to a pronunciation." },
  { id: "splice", name: "Splice", title: "Pronunciations drop in", summary: "The decided readings replace those words in the phoneme string; every other word keeps its lexicon phonemes." },
  { id: "voice", name: "Voice", title: "The voice speaks", summary: "Kokoro renders the phoneme string on device, and the audio queues behind the utterance that is playing." },
  { id: "timing", name: "Timing", title: "Staying ahead of the listener", summary: "The model pass runs as a background worker up to 40 utterances ahead of the playhead. Synthesis takes whatever answers are ready and never waits for one." },
];
