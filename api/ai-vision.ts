import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

interface AiVisionRequestBody {
  mode?: 'visual-search' | 'recommend';
  mimeType?: string;
  base64Data?: string;
  imageUrl?: string;
  title?: string;
  query?: string;
  favoriteTitles?: string[];
  recentQueries?: string[];
}

const WALLPAPER_CATEGORIES = [
  'AMOLED Wallpapers',
  'Nature',
  'Minimal',
  'Abstract',
  'Cars',
  'Anime',
  'Gaming',
  'Space',
  'Architecture',
  'Technology',
  'Dark Aesthetic',
  'Luxury',
  'Cinematic',
  'Typography',
];

async function fetchRemoteImageAsBase64(
  url: string
): Promise<{ mimeType: string; data: string } | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Referer: 'https://www.pinterest.com/',
      },
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!contentType.startsWith('image/')) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > 5 * 1024 * 1024) return null;
    return {
      mimeType: contentType,
      data: Buffer.from(buf).toString('base64'),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as AiVisionRequestBody;
    const mode = body.mode || 'visual-search';
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json(
        {
          error:
            'GEMINI_API_KEY is not configured. Check the Settings > Secrets panel to enable AI visual analysis.',
        },
        { status: 503 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    if (mode === 'recommend') {
      const promptSeed = body.query?.trim() || 'AMOLED dark mobile wallpaper';
      const favContext = (body.favoriteTitles || []).slice(0, 6).join(', ');
      const recentContext = (body.recentQueries || []).slice(0, 5).join(', ');

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `User natural-language request or current topic: "${promptSeed}".
Saved favorite titles: "${favContext || 'None'}".
Recent searches: "${recentContext || 'None'}".
Generate 6 diverse, high-signal wallpaper search queries and classify the best matching category from: ${WALLPAPER_CATEGORIES.join(', ')}.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              interpretedQuery: {
                type: Type.STRING,
                description: 'Optimized 3-5 word wallpaper search query matching user intent.',
              },
              category: {
                type: Type.STRING,
                description: 'Best matching category from the provided list.',
              },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    query: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ['label', 'query', 'reason'],
                },
              },
            },
            required: ['interpretedQuery', 'category', 'recommendations'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
      return Response.json(parsed);
    }

    // mode === 'visual-search': Analyze uploaded base64 image or remote pin imageUrl
    let inlineImage: { mimeType: string; data: string } | null = null;

    if (body.base64Data && body.mimeType) {
      const cleanBase64 = body.base64Data.replace(/^data:image\/[^;]+;base64,/, '');
      inlineImage = {
        mimeType: body.mimeType,
        data: cleanBase64,
      };
    } else if (body.imageUrl) {
      inlineImage = await fetchRemoteImageAsBase64(body.imageUrl);
    }

    if (!inlineImage) {
      return Response.json(
        { error: 'Unable to read image data for visual analysis.' },
        { status: 400 }
      );
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: inlineImage.mimeType,
              data: inlineImage.data,
            },
          },
          {
            text: `Analyze this image for a mobile & desktop wallpaper discovery engine.
1. Identify the main visual subject.
2. Classify it into the single best category from: ${WALLPAPER_CATEGORIES.join(', ')}.
3. Extract 4 dominant hex color codes (#RRGGBB) visible in the image.
4. Provide 5 concise visual tags (lowercase, 1-2 words).
5. Provide 4 specific Pinterest/wallpaper search queries to find visually similar wallpapers.
6. Write a 1-sentence mood and lighting description.`,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            category: { type: Type.STRING },
            dominantColors: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            recommendedQueries: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            moodDescription: { type: Type.STRING },
          },
          required: [
            'subject',
            'category',
            'dominantColors',
            'tags',
            'recommendedQueries',
            'moodDescription',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
    return Response.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI visual analysis failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
