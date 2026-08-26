// Lance "watch video" tool.
// Reads an actual YouTube video -- frames and audio, not just the transcript --
// through Google Gemini and returns a scene-by-scene breakdown with timestamps.
// Needs GEMINI_API_KEY in the environment. Free key: https://aistudio.google.com/apikey

const DEFAULT_MODEL = 'gemini-2.5-flash';

const FULL_REPORT_PROMPT = `You are watching this video for Pastor Devon. Give a real breakdown, not a summary.

Return these sections, in this order, using markdown headings:

# Overview
Two or three sentences on what this video is and who it seems to be for.

## Scene-by-scene
A numbered list. For every distinct shot or cut give the exact timestamp it starts (M:SS), what is on screen, and any camera move or edit. Short-form video cuts fast -- catch every cut.

## Transcript
Everything spoken, with timestamps. If the video is silent, music only, or ambient noise only, say that plainly. Never invent a voiceover.

## On-screen captions
Every word of on-screen text or caption, with the timestamp it appears. If there is none, say so.

## Structure
Name the hook (first few seconds), the turn, and the payoff. Quote the exact lines or describe the exact frames that do each job.

## Pacing
Average shot length, where it speeds up or slows down, and what the edit is doing to hold attention.

## Why it works (or doesn't)
Direct, honest read.

Hard rules you never break:
- Only describe what is actually in the video. Never invent a creator, speaker, brand, statistic, or quote.
- Use only real timestamps from the video. Never estimate or round one to look tidy.
- If there is no voiceover, say so instead of filling the gap.`;

function clipToOffsets(clip) {
  // "0:00-0:05" -> { startOffset: "0s", endOffset: "5s" }
  if (!clip || typeof clip !== 'string' || clip.indexOf('-') === -1) return null;
  const [rawStart, rawEnd] = clip.split('-').map((s) => s.trim());
  const toSeconds = (t) => {
    const parts = t.split(':').map((p) => parseInt(p, 10));
    if (parts.some((n) => Number.isNaN(n))) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  };
  const start = toSeconds(rawStart);
  const end = toSeconds(rawEnd);
  if (start === null || end === null) return null;
  return { startOffset: `${start}s`, endOffset: `${end}s` };
}

function isYouTube(url) {
  return /(?:youtube\.com\/|youtu\.be\/)/i.test(url || '');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: 'Video watching is not set up yet. Add a GEMINI_API_KEY to the Vercel environment. Grab a free key at https://aistudio.google.com/apikey then redeploy.',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { url, prompt, clip, fps, model } = body;

    if (!url) return res.status(400).json({ error: 'Missing video url.' });
    if (!isYouTube(url)) {
      return res.status(400).json({
        error: 'Lance can watch YouTube links directly. For a private, unlisted, or downloaded video, that has to run on the desktop instead.',
      });
    }

    const videoMetadata = {};
    const offsets = clipToOffsets(clip);
    if (offsets) Object.assign(videoMetadata, offsets);
    const fpsNum = parseFloat(fps);
    if (!Number.isNaN(fpsNum) && fpsNum > 0) videoMetadata.fps = fpsNum;

    const videoPart = { file_data: { file_uri: url } };
    if (Object.keys(videoMetadata).length > 0) videoPart.video_metadata = videoMetadata;

    const parts = [
      { text: (prompt && prompt.trim()) ? prompt.trim() : FULL_REPORT_PROMPT },
      videoPart,
    ];

    const useModel = (model && String(model).trim()) || DEFAULT_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${encodeURIComponent(key)}`;

    const gRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
      }),
    });

    const data = await gRes.json();

    if (!gRes.ok) {
      const msg = data?.error?.message || `Gemini error ${gRes.status}`;
      return res.status(502).json({ error: msg });
    }

    const analysis = (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join('')
      .trim();

    if (!analysis) {
      const reason = data?.candidates?.[0]?.finishReason;
      return res.status(502).json({
        error: reason
          ? `Gemini returned no analysis (${reason}). The video may be private, age-restricted, or too long for this clip window.`
          : 'Gemini returned no analysis. The link may be private, unlisted, or age-restricted.',
      });
    }

    return res.status(200).json({ analysis, model: useModel });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
