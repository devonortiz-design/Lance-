// Lance "watch video" tool.
// Reads an actual YouTube video -- frames and audio, not just the transcript --
// through Google Gemini and returns a scene-by-scene breakdown with timestamps.
// Needs GEMINI_API_KEY in the environment. Free key: https://aistudio.google.com/apikey

const DEFAULT_MODEL = 'gemini-flash-latest';

// Mirrors the desktop watch_video.py skill so a breakdown reads the same on
// either surface. Accuracy rules come first on purpose.
const FULL_REPORT_PROMPT = `Analyze this video and return a structured markdown report using the exact sections below.

ACCURACY RULES - these override everything else:
1. Report only what is actually in the video. Do not infer, guess, or fill in plausible-sounding detail.
2. Never invent a creator, presenter, narrator, or speaker name. If no name is shown on screen or clearly spoken, say the video has no identified creator.
3. Never fabricate a voiceover, dialogue, or transcript. Many videos are silent or have music only, and that is normal. If there is no speech, say "No speech detected."
4. Separate what you SEE from what you INFER. Label anything inferred with "(inferred)".
5. Use only real timestamps taken from the video. Never estimate or invent one.

## Summary
Two to four sentences on what actually happens and who the video is for.

## Scene-by-Scene Breakdown
Walk the video in order with \`MM:SS\` timestamps for every distinct cut, scene, or beat. For each one give:
- what is on screen (people, setting, b-roll, product, UI)
- what is said, if anything
- any on-screen text or caption, quoted verbatim
- the cut or transition that ends the beat

## Audio
Report only what you actually hear. Valid answers include "No audio track present", "Silent - no speech, music, or effects detected", "Music only: [describe]", or a verbatim transcript with \`MM:SS\` timestamps if speech is genuinely present.

## On-Screen Text and Visuals
Every caption, title card, or overlay, quoted verbatim with its timestamp. Then the caption style, the text placement, and any branding or products actually shown.

## Structure
Identify these four beats with timestamps, and say plainly if one is missing:
- The hook: the first 3 seconds, what is said and what is shown
- The turn: where the video shifts or the tension is introduced
- The payoff: the moment the promise is delivered
- The close: how it ends and what the viewer is asked to do

## Pacing
Average seconds per cut, the total number of cuts, and where the pace changes.

## Key Moments
Three to seven \`[MM:SS] Description\` bullets a viewer would actually remember.

Be concrete. When you are unsure, say so. Reporting less with confidence beats reporting more with confabulation.`;

function clipToOffsets(clip) {
  // "0:00-0:05" -> { start_offset: "0s", end_offset: "5s" }, matching the API's video_metadata keys.
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
  return { start_offset: `${start}s`, end_offset: `${end}s` };
}

function isYouTube(url) {
  return /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test((url || '').trim());
}

// Gemini reliably accepts the canonical watch?v= form. Normalize youtu.be,
// /live/, /shorts/, and /embed/ links (and drop tracking params) to that.
function canonicalizeYouTube(url) {
  const u = (url || '').trim();
  const m =
    u.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    u.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i) ||
    u.match(/\/(?:live|shorts|embed)\/([A-Za-z0-9_-]{11})/i);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : u;
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

    const videoPart = { file_data: { file_uri: canonicalizeYouTube(url) } };
    if (Object.keys(videoMetadata).length > 0) videoPart.video_metadata = videoMetadata;

    const parts = [
      videoPart,
      { text: (prompt && prompt.trim()) ? prompt.trim() : FULL_REPORT_PROMPT },
    ];

    const useModel = (model && String(model).trim()) || DEFAULT_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`;

    // Key travels in a header, not the URL, so it stays out of access logs.
    const reqBody = JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
    });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const busy = (status, msg) =>
      status === 429 || status === 500 || status === 502 || status === 503 || status === 529 ||
      /overloaded|high demand|temporarily|try again later/i.test(msg || '');

    const MAX_TRIES = 4;
    let lastStatus = 502;
    let lastMsg = 'Gemini did not respond.';
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      let gRes, data;
      try {
        gRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: reqBody,
        });
        data = await gRes.json();
      } catch (e) {
        lastMsg = e && e.message ? e.message : 'Network error reaching Gemini.';
        if (attempt < MAX_TRIES - 1) { await wait(1000 * 2 ** attempt); continue; }
        return res.status(502).json({ error: 'Could not reach the video service. Try again in a moment.' });
      }

      if (gRes.ok) {
        const analysis = (data?.candidates?.[0]?.content?.parts || [])
          .map((p) => p.text || '')
          .join('')
          .trim();
        if (analysis) return res.status(200).json({ analysis, model: useModel });
        const reason = data?.candidates?.[0]?.finishReason;
        return res.status(502).json({
          error: reason
            ? `Gemini returned no analysis (${reason}). The video may be private, age-restricted, or still live.`
            : 'Gemini returned no analysis. The link may be private, unlisted, or age-restricted.',
        });
      }

      lastStatus = gRes.status;
      lastMsg = data?.error?.message || `Gemini error ${gRes.status}`;
      if (busy(gRes.status, lastMsg) && attempt < MAX_TRIES - 1) {
        await wait(1000 * 2 ** attempt);
        continue;
      }
      break;
    }

    // Retries exhausted, or a non-retryable error -- give a clear message.
    if (busy(lastStatus, lastMsg)) {
      return res.status(502).json({ error: 'The video service is busy right now. Give it a minute and tap retry.' });
    }
    if (lastStatus === 400) {
      return res.status(400).json({ error: 'Gemini could not read that link. It may be an ongoing livestream, or a private, unlisted, or age-restricted video. A normal public YouTube video works best.' });
    }
    if (lastStatus === 404) {
      return res.status(502).json({ error: lastMsg + ' Try model=gemini-2.5-flash.' });
    }
    return res.status(502).json({ error: lastMsg });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
