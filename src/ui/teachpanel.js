/**
 * The Learn and Quiz panels.
 *
 * Both drive the simulator rather than replacing it: a lesson step can push a
 * patch into the store, so the model on screen is always the one being talked
 * about. Nothing is ever locked — a student who wants to wander off and drag a
 * slider mid-lesson should be able to, because that is the behaviour the tool
 * is trying to encourage.
 */

import { LESSONS } from '../teach/lessons.js';
import { QUESTIONS, pickQuestions } from '../teach/quiz.js';

/* ------------------------------------------------------------------ */
export function createLearnPanel(container, store) {
  let lessonIndex = 0;
  let stepIndex = 0;
  let answered = null;

  function open(i) {
    lessonIndex = i;
    stepIndex = 0;
    answered = null;
    const lesson = LESSONS[i];
    if (lesson.setup) store.set(lesson.setup);
    render();
  }

  function go(delta) {
    const lesson = LESSONS[lessonIndex];
    const next = stepIndex + delta;
    if (next < 0) {
      if (lessonIndex > 0) open(lessonIndex - 1);
      return;
    }
    if (next >= lesson.steps.length) {
      if (lessonIndex < LESSONS.length - 1) open(lessonIndex + 1);
      return;
    }
    stepIndex = next;
    answered = null;
    const step = lesson.steps[stepIndex];
    // A step may reconfigure the simulator so the question is about what is
    // actually on screen.
    if (step.apply) store.set(step.apply);
    render();
  }

  function render() {
    const lesson = LESSONS[lessonIndex];
    const step = lesson.steps[stepIndex];
    const last = stepIndex === lesson.steps.length - 1 && lessonIndex === LESSONS.length - 1;

    let body = '';
    if (step.type === 'read') {
      body = `<h4>${step.title}</h4>${paragraphs(step.body)}`;
    } else {
      body = `
        <h4>Predict first</h4>
        <p class="teach-question">${step.question}</p>
        <div class="teach-options">
          ${step.options
            .map(
              (opt, i) =>
                `<button type="button" class="teach-option" data-i="${i}"
                   ${answered !== null ? 'disabled' : ''}
                   ${answered !== null && i === step.correct ? 'data-state="correct"' : ''}
                   ${answered !== null && i === answered && i !== step.correct ? 'data-state="wrong"' : ''}
                 >${opt}</button>`,
            )
            .join('')}
        </div>
        ${
          answered !== null
            ? `<div class="teach-reveal ${answered === step.correct ? 'is-correct' : 'is-wrong'}">
                 <strong>${answered === step.correct ? 'Correct.' : 'Not quite.'}</strong>
                 ${paragraphs(step.reveal)}
               </div>`
            : '<p class="teach-hint">Commit to an answer before revealing — the guess is what makes it stick.</p>'
        }`;
    }

    container.innerHTML = `
      <div class="teach-head">
        <select id="lesson-select" aria-label="Choose a lesson">
          ${LESSONS.map((l, i) => `<option value="${i}" ${i === lessonIndex ? 'selected' : ''}>${l.title}</option>`).join('')}
        </select>
        <span class="teach-progress">Step ${stepIndex + 1} of ${lesson.steps.length}</span>
      </div>
      <p class="teach-concept">${lesson.concept}</p>
      <div class="teach-body">${body}</div>
      <div class="teach-nav">
        <button type="button" id="teach-back" ${lessonIndex === 0 && stepIndex === 0 ? 'disabled' : ''}>Back</button>
        <button type="button" id="teach-next" class="primary" ${last ? 'disabled' : ''}>
          ${stepIndex === lesson.steps.length - 1 ? 'Next lesson' : 'Next'}
        </button>
      </div>`;

    container.querySelector('#lesson-select').addEventListener('change', (e) => open(Number(e.target.value)));
    container.querySelector('#teach-back').addEventListener('click', () => go(-1));
    container.querySelector('#teach-next').addEventListener('click', () => go(1));
    for (const b of container.querySelectorAll('.teach-option')) {
      b.addEventListener('click', () => {
        answered = Number(b.dataset.i);
        render();
      });
    }
  }

  open(0);
  return { open, render };
}

/* ------------------------------------------------------------------ */
export function createQuizPanel(container) {
  let questions = [];
  let index = 0;
  let answered = null;
  let score = 0;
  let done = false;

  function start() {
    questions = pickQuestions(6);
    index = 0;
    answered = null;
    score = 0;
    done = false;
    render();
  }

  function render() {
    if (done) {
      const pct = Math.round((score / questions.length) * 100);
      container.innerHTML = `
        <div class="teach-body">
          <h4>Round complete</h4>
          <p class="quiz-score">${score} / ${questions.length} <span>(${pct}%)</span></p>
          <p class="teach-hint">${
            pct === 100
              ? 'Every one. Try the Learn tab for the reasoning behind the harder ones.'
              : pct >= 60
                ? 'Solid. The explanations above each answer are where the detail lives.'
                : 'Worth a pass through the Learn lessons — they cover every one of these.'
          }</p>
        </div>
        <div class="teach-nav"><button type="button" id="quiz-restart" class="primary">New round</button></div>`;
      container.querySelector('#quiz-restart').addEventListener('click', start);
      return;
    }

    const q = questions[index];
    container.innerHTML = `
      <div class="teach-head">
        <span class="badge badge-info">${q.topic}</span>
        <span class="teach-progress">Question ${index + 1} of ${questions.length} · score ${score}</span>
      </div>
      <div class="teach-body">
        ${q.live ? '<p class="teach-hint">You can answer this one by experimenting in the simulator.</p>' : ''}
        <p class="teach-question">${q.question}</p>
        <div class="teach-options">
          ${q.options
            .map(
              (opt, i) =>
                `<button type="button" class="teach-option" data-i="${i}"
                   ${answered !== null ? 'disabled' : ''}
                   ${answered !== null && i === q.correct ? 'data-state="correct"' : ''}
                   ${answered !== null && i === answered && i !== q.correct ? 'data-state="wrong"' : ''}
                 >${opt}</button>`,
            )
            .join('')}
        </div>
        ${
          answered !== null
            ? `<div class="teach-reveal ${answered === q.correct ? 'is-correct' : 'is-wrong'}">
                 <strong>${answered === q.correct ? 'Correct.' : 'Not quite.'}</strong>
                 ${paragraphs(q.explain)}
               </div>`
            : ''
        }
      </div>
      <div class="teach-nav">
        <button type="button" id="quiz-next" class="primary" ${answered === null ? 'disabled' : ''}>
          ${index === questions.length - 1 ? 'See score' : 'Next question'}
        </button>
      </div>`;

    for (const b of container.querySelectorAll('.teach-option')) {
      b.addEventListener('click', () => {
        answered = Number(b.dataset.i);
        if (answered === q.correct) score++;
        render();
      });
    }
    container.querySelector('#quiz-next').addEventListener('click', () => {
      if (index === questions.length - 1) done = true;
      else {
        index++;
        answered = null;
      }
      render();
    });
  }

  start();
  return { start };
}

/** Split a body string on blank lines into paragraphs. */
function paragraphs(text) {
  return text
    .split('\n\n')
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export const QUIZ_SIZE = QUESTIONS.length;
