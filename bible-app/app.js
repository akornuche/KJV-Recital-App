let bibleData = {};
let booksOrder = [];
let oldTestamentBooks = [];
let newTestamentBooks = [];
let currentIndex = 0;

// Levenshtein Distance Function (for calculating text similarity)
function levenshtein(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function getAccuracy(spoken, expected) {
  const distance = levenshtein(spoken, expected);
  const maxLen = Math.max(spoken.length, expected.length);
  return ((maxLen - distance) / maxLen) * 100;
}

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function highlightDifferences(user, actual) {
  const userWords = normalize(user).split(/\s+/);
  const actualWords = normalize(actual).split(/\s+/);
  let result = [];

  for (let i = 0; i < actualWords.length; i++) {
    if (userWords[i] === actualWords[i]) {
      result.push(`<span class="correct">${actualWords[i]}</span>`);
    } else {
      result.push(`<span class="wrong">${actualWords[i]}</span>`);
    }
  }

  return result.join(' ');
}

async function loadBible() {
  const response = await fetch('kjv.json');
  const data = await response.json();

  bibleData = data;
  booksOrder = [...new Set(Object.keys(bibleData).map(k => k.replace(/ ?\d*:\d*$/, '')))];
  
  const splitIndex = booksOrder.findIndex(b => b.startsWith("Matthew"));
  oldTestamentBooks = booksOrder.slice(0, splitIndex);
  newTestamentBooks = booksOrder.slice(splitIndex);

  populateDropdowns();
  showPrompt();
}

function populateDropdowns() {
  const oldDropdown = document.getElementById('old-testament');
  const newDropdown = document.getElementById('new-testament');
  oldDropdown.innerHTML = `<option value="">📖 Old Testament</option>`;
  newDropdown.innerHTML = `<option value="">📖 New Testament</option>`;

  oldTestamentBooks.forEach(book => {
    oldDropdown.innerHTML += `<option value="${book}">${book}</option>`;
  });
  newTestamentBooks.forEach(book => {
    newDropdown.innerHTML += `<option value="${book}">${book}</option>`;
  });

  oldDropdown.addEventListener('change', (e) => {
    if (e.target.value) selectBook(e.target.value);
  });

  newDropdown.addEventListener('change', (e) => {
    if (e.target.value) selectBook(e.target.value);
  });
}

function selectBook(book) {
  currentIndex = booksOrder.indexOf(book);
  showPrompt();
}

function showPrompt() {
  const book = booksOrder[currentIndex];
  document.getElementById('prompt').innerText = `📖 ${book}`;
  document.getElementById('result').innerText = '';
  document.getElementById('heard').innerText = '';
  document.getElementById('start-btn').innerText = 'Start Speaking';

  const progressPercent = ((currentIndex + 1) / booksOrder.length) * 100;
  document.getElementById('progress-bar').style.width = `${progressPercent}%`;
  document.getElementById('progress-text').innerText = `${currentIndex + 1} of ${booksOrder.length} books complete`;
}

function startListening() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert('Your browser does not support Speech Recognition.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  document.getElementById('start-btn').innerText = 'Listening...';
  document.getElementById('result').innerText = '';

  recognition.start();

  recognition.onresult = function (event) {
    const spokenText = event.results[0][0].transcript;
    document.getElementById('heard').innerText = `👂 You said: "${spokenText}"`;
    checkAgainstBook(spokenText);
  };

  recognition.onerror = function (event) {
    document.getElementById('result').innerText = 'Error: ' + event.error;
    document.getElementById('start-btn').innerText = 'Try Again';
  };

  recognition.onend = function () {
    if (document.getElementById('start-btn').innerText === 'Listening...') {
      document.getElementById('start-btn').innerText = 'Try Again';
    }
  };
}

function findClosestBook(raw) {
  const rawNorm = normalize(raw);
  let best = { book: null, score: 0 };

  booksOrder.forEach(book => {
    const score = getAccuracy(rawNorm, normalize(book));
    if (score > best.score) best = { book, score };
  });

  return best.book;
}

function checkAgainstBook(spokenText) {
  const normalized = normalize(spokenText);
  const refMatch = spokenText.match(/([\w\s]+?)\s*(?:chapter\s*)?(\d+)[\s:]+(?:verse\s*)?(\d+)/i);

  if (!refMatch) {
    document.getElementById('result').innerText = '❌ Could not parse your reference. Try saying something like "Genesis 1:1".';
    return;
  }

  let [, bookRaw, chapter, verse] = refMatch;
  bookRaw = normalize(bookRaw.trim());
  chapter = parseInt(chapter);
  verse = parseInt(verse);

  const matchedBook = findClosestBook(bookRaw);

  if (!matchedBook) {
    document.getElementById('result').innerText = `❌ Unknown book "${bookRaw}". Try again.`;
    return;
  }

  const verseKey = `${matchedBook} ${chapter}:${verse}`;
  const actualVerse = bibleData[verseKey];

  if (!actualVerse) {
    document.getElementById('result').innerText = `❌ Verse "${verseKey}" not found in Bible data.`;
    return;
  }

  const userQuoteStart = spokenText.toLowerCase().indexOf(verse.toString());
  const userQuote = userQuoteStart >= 0 ? spokenText.slice(userQuoteStart + verse.toString().length) : spokenText;

  const accuracy = getAccuracy(normalize(userQuote), normalize(actualVerse));
  const resultDiv = document.getElementById('result');
  const button = document.getElementById('start-btn');

  if (accuracy >= 70) {
    resultDiv.innerHTML = `
      ✅ Matched ${verseKey} at ${accuracy.toFixed(1)}%<br>
      <div>📖 <strong>Expected:</strong> ${highlightDifferences(userQuote, actualVerse)}</div>
      <div>✅ You can click "Next Book" to continue.</div>
    `;
    button.innerText = 'Next Book';

    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('previous-btn');
    nextBtn.onclick = null;
    prevBtn.onclick = null;

    nextBtn.onclick = () => {
      currentIndex = (currentIndex + 1) % booksOrder.length;
      showPrompt();
    };

    prevBtn.onclick = () => {
      currentIndex = (currentIndex - 1 + booksOrder.length) % booksOrder.length;
      showPrompt();
    };
  } else {
    resultDiv.innerHTML = `
      ❌ Match too low (${accuracy.toFixed(1)}%)<br>
      <div>📖 <strong>Expected:</strong> ${highlightDifferences(userQuote, actualVerse)}</div>
      <div>🔁 Try again.</div>
    `;
    button.innerText = 'Try Again';
  }
}

document.getElementById('start-btn').addEventListener('click', startListening);
loadBible();
