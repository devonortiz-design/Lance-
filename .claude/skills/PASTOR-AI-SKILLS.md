# Pastor AI Skills

The following skills in this folder come from the open-source
**pastor-ai-skills** collection by Thomas Costello:

announcement-script, church-email, church-letter, church-social-post,
meeting-agenda, midweek-devotional, pastor-foundation, sermon-brainstorm,
sermon-research, sermon-series, sermon-to-blog, sermon-to-youtube,
small-group-questions, social-media-calendar.

Source: https://github.com/tkcostello/pastor-ai-skills
License: MIT (see PASTOR-AI-SKILLS-LICENSE).

`pastor-foundation` is the shared context layer the others build on;
it asks for church details once, then every skill reuses them.

Some skills generate PDFs and need reportlab: `pip install reportlab`.

The `watch-video` skill in this folder is separate and not part of this collection.
