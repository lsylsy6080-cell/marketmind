let translatorPromise: Promise<any> | null = null;

const MODEL = process.env.NEWS_LOCAL_TRANSLATION_MODEL ?? "Xenova/nllb-200-distilled-600M";

async function getTranslator(): Promise<any> {
  if (!translatorPromise) {
    translatorPromise = (async () => {
      const moduleName = "@huggingface/transformers";
      let module: any;
      try {
        module = await import(moduleName);
      } catch {
        throw new Error(
          "@huggingface/transformers 패키지가 없습니다. market-worker 폴더에서 npm install을 한 번 실행하세요.",
        );
      }
      const { pipeline, env } = module;
      // 모델은 최초 1회 Hugging Face에서 다운로드되고 이후 로컬 캐시를 사용합니다.
      env.allowLocalModels = true;
      return pipeline("translation", MODEL, { dtype: "q4" } as any);
    })();
  }
  return translatorPromise;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function postProcessHeadline(value: string): string {
  return clean(value)
    .replace(/^비트코인은\b/, "비트코인")
    .replace(/\s+([,.!?])/g, "$1")
    .slice(0, 180);
}

export async function translateEnglishToKorean(text: string): Promise<string> {
  const source = clean(text);
  if (!source) return "";
  const translator = await getTranslator();
  const output = await translator(source.slice(0, 900), {
    src_lang: "eng_Latn",
    tgt_lang: "kor_Hang",
    max_new_tokens: 220,
  } as any);
  const first = Array.isArray(output) ? output[0] : output;
  const translated = String(first?.translation_text ?? "").trim();
  if (!translated) throw new Error("로컬 번역 결과가 비어 있습니다.");
  return translated;
}

export async function translateNewsLocally(input: {
  title: string;
  summary: string | null;
}): Promise<{ title: string; summary: string }> {
  const title = postProcessHeadline(await translateEnglishToKorean(input.title));
  const bodySource = input.summary?.trim() || input.title;
  const translatedSummary = clean(await translateEnglishToKorean(bodySource));
  return {
    title,
    summary: translatedSummary.slice(0, 700),
  };
}
