import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const { content, course, topic, questionCount = 20 } = await req.json();
    const prompt = `You are Lance, academic assistant for Pastor Devon Ortiz, professor at Golden State Baptist College.

Courses taught: Parables of Jesus, Youth Ministry.
Exam format: Fill-in-the-blank only. Always produce TWO versions: student version (blanks) and teacher key (answers filled in).

Course: ${course || 'not specified'}
Topic: ${topic || 'not specified'}
Source content: ${content || 'Generate from course topic'}
Number of questions: ${questionCount}

Produce exactly this output:

# ${course || 'Course'} EXAM — ${topic || 'Topic'}
## STUDENT VERSION

**Name:** _________________________ **Date:** _____________ **Score:** _____/${questionCount}

*Fill in the blank with the correct answer.*

[Number each question. Use _______________ for blanks. Make blanks consistent length. Questions should test comprehension, key terms, biblical references, and theological concepts. Vary difficulty.]

---

# ${course || 'Course'} EXAM — ${topic || 'Topic'}
## TEACHER KEY

[Same questions with answers filled in bold. Include brief notes where helpful.]`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    const examContent = data.content?.[0]?.text || 'Error generating exam';
    return new Response(JSON.stringify({ content: examContent }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
