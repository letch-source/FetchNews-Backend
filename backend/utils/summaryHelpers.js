/**
 * Summary Helper Utilities
 *
 * Extracted from index.js to break the circular dependency caused by
 * routes/testFetch.js and routes/scheduledSummaries.js importing from index.js.
 *
 * Import these helpers directly instead of requiring index.js:
 *   const { combineTopicSummaries, addIntroAndOutro } = require('../utils/summaryHelpers');
 */

function getTopicTransition(topic, index, totalTopics) {
  const formattedTopic = topic.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');

  const transitions = [
    `And moving onto news about ${formattedTopic}.`,
    `Now, let's turn to ${formattedTopic}.`,
    `Shifting focus to ${formattedTopic}.`,
    `Next up, ${formattedTopic} news.`,
    `Turning our attention to ${formattedTopic}.`,
    `And now for updates on ${formattedTopic}.`,
    `Let's check in on ${formattedTopic}.`,
    `Switching gears to ${formattedTopic}.`,
    `Up next, ${formattedTopic}.`,
    `Now for ${formattedTopic} updates.`,
    `Moving forward with ${formattedTopic} news.`,
    `Here's what's happening in ${formattedTopic}.`,
    `And in ${formattedTopic} news.`,
    `Let's dive into ${formattedTopic}.`,
    `Now covering ${formattedTopic}.`
  ];

  return transitions[index % transitions.length];
}

function combineTopicSummaries(summariesWithTopics) {
  if (!summariesWithTopics || summariesWithTopics.length === 0) {
    return '';
  }

  if (summariesWithTopics.length === 1) {
    return summariesWithTopics[0].summary.trim();
  }

  const parts = [];
  summariesWithTopics.forEach((item, index) => {
    if (item.summary && item.summary.trim()) {
      if (index > 0) {
        const transition = getTopicTransition(item.topic, index - 1, summariesWithTopics.length);
        parts.push(transition);
      }
      parts.push(item.summary.trim());
    }
  });

  return parts.join('\n\n');
}

function addIntroAndOutro(summary, topics, goodNewsOnly = false, user = null) {
  if (!summary || summary.trim().length === 0) {
    return summary;
  }

  const userTimezone = user?.preferences?.timezone || 'America/New_York';
  const now = new Date();
  const userTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
  const hour = userTime.getHours();

  let timeOfDay;
  if (hour < 12) {
    timeOfDay = 'morning';
  } else if (hour < 17) {
    timeOfDay = 'afternoon';
  } else {
    timeOfDay = 'nightly';
  }

  const formattedDate = userTime.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  let firstName = null;
  if (user?.name) {
    const nameParts = user.name.trim().split(/\s+/);
    firstName = nameParts[0] || null;
  }

  const personalizedGreeting = firstName ? `Hello, ${firstName}` : 'Hello';
  const intro = `${personalizedGreeting}, here's your ${timeOfDay} news for ${formattedDate}. `;
  const outro = ' That\'s it for your news summary, brought to you by Fetch News.';

  return intro + summary.trim() + outro;
}

module.exports = { combineTopicSummaries, addIntroAndOutro };
