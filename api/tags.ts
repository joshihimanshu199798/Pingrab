import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

interface TagPinInput {
  id: string;
  imageUrl: string;
  fallbackUrl?: string;
  title?: string;
}

const ALLOWED_IMAGE_HOSTS = ['i.pinimg.com', 'images.unsplash.com'];

function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function fetchImageInlinePart(
  pin: TagPinInput
): Promise<{ id: string; mimeType: string; data: string } | null> {
  // Prefer smaller 736x/474x fallback URL for fast multimodal tag inference
  const candidateUrl =
    pin.fallbackUrl && isAllowedImageUrl(pin.fallbackUrl)
      ? pin.fallbackUrl
      : isAllowedImageUrl(pin.imageUrl)
      ? pin.imageUrl
      : null;

  if (!candidateUrl) return null;

  try {
    const res = await fetch(candidateUrl, {
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

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > 4 * 1024 * 1024) {
      return null;
    }

    return {
      id: pin.id,
      mimeType: contentType,
      data: Buffer.from(arrayBuffer).toString('base64'),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: 'GEMINI_API_KEY is not configured for visual tag extraction' },
        { status: 503 }
      );
    }

    const body = (await request.json()) as { pins?: TagPinInput[] };
    const inputPins = Array.isArray(body?.pins) ? body.pins.slice(0, 8) : [];

    if (inputPins.length === 0) {
      return Response.json({ tagsById: {} });
    }

    const loadedImages = (await Promise.all(inputPins.map(fetchImageInlinePart))).filter(
      (item): item is { id: string; mimeType: string; data: string } => item !== null
    );

    if (loadedImages.length === 0) {
      return Response.json({ tagsById: {} });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [
      {
        text:
          'Analyze each image below and extract 3 to 4 concise, descriptive lowercase keywords (1-2 words each, e.g. "walnut desk", "minimalist", "serif quote", "dark ui", "linen chair") describing the visible subject, style, material, or mood. Return tags keyed to the exact id provided before each image.',
      },
    ];

    for (const img of loadedImages) {
      parts.push({ text: `Image ID: ${img.id}` });
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: { parts },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['id', 'tags'],
              },
            },
          },
          required: ['items'],
        },
      },
    });

    const raw = (response.text ?? '{}').trim();
    const parsed = JSON.parse(raw) as {
      items?: Array<{ id?: string; tags?: string[] }>;
    };

    const tagsById: Record<string, string[]> = {};
    for (const entry of parsed.items || []) {
      if (!entry?.id || !Array.isArray(entry.tags)) continue;
      const cleaned = entry.tags
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 2 && t.length <= 24)
        .slice(0, 4);
      if (cleaned.length > 0) {
        tagsById[entry.id] = Array.from(new Set(cleaned));
      }
    }

    return Response.json({ tagsById });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tag extraction failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
