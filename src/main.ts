// Boot: fonts + styles, persistence, shell, router, hotkeys.
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/layout.css';

import { initPersistence, getSave, updateSave } from './app/persist';
import { createRouter, setRouter } from './app/router';
import { installHotkeys } from './app/hotkeys';
import { buildShell } from './app/shell';
import { toast, achievementToast } from './ui/components/toast';
import { evaluateAchievements } from './game/achievements';
import { comingSoon } from './pages/common';
import { homePage } from './pages/home';
import { drillsPage, drillSessionPage } from './pages/drills';
import { flashcardsPage } from './pages/flashcards';
import { tracksPage, trackPage } from './pages/tracks';
import { lessonPage } from './pages/lesson';
import { challengePage } from './pages/challenge';
import { dailyPage, dailyPlayPage } from './pages/daily';
import { speedrunPage, speedrunRunPage } from './pages/speedrun';
import { errorHuntListPage, errorHuntPage } from './pages/errorhunt';
import { statsPage } from './pages/stats';
import { achievementsPage } from './pages/achievements';
import { settingsPage } from './pages/settings';
import { referencePage } from './pages/reference';
import { sandboxPage } from './pages/sandbox';
import { trainerPage } from './pages/trainer';

const { corruptBackup } = initPersistence();
installHotkeys();

const app = document.getElementById('app')!;
const { main, bind } = buildShell(app);
const router = createRouter(main);
setRouter(router);
bind(router);

router
  .add('/', homePage)
  .add('/drills', drillsPage)
  .add('/drills/session', drillSessionPage)
  .add('/flashcards', flashcardsPage)
  .add('/tracks', tracksPage)
  .add('/tracks/:id', trackPage)
  .add('/lesson/:id', lessonPage)
  .add('/challenge/:id', challengePage, { full: true })
  .add('/daily', dailyPage)
  .add('/daily/play', dailyPlayPage, { full: true })
  .add('/speedrun', speedrunPage)
  .add('/speedrun/run', speedrunRunPage, { full: true })
  .add('/errorhunt', errorHuntListPage)
  .add('/errorhunt/:id', errorHuntPage, { full: true })
  .add('/stats', statsPage)
  .add('/achievements', achievementsPage)
  .add('/settings', settingsPage)
  .add('/reference', referencePage)
  .add('/sandbox', sandboxPage, { full: true })
  .add('/train', trainerPage, { full: true })
  .add('/train/:id', trainerPage, { full: true })
  .notFound(({ root, path }) => comingSoon(root, 'Not found', `No page at ${path}.`, { href: '#/', label: 'Home' }));

router.start();

if (corruptBackup) toast(`Your saved progress could not be read. A copy was kept as ${corruptBackup}.`, { kind: 'err', ms: 8000 });

// Retro-evaluate achievements (e.g. after an import or a content update).
const unlocked = evaluateAchievements(getSave(), { kind: 'boot' });
if (unlocked.length) {
  updateSave(() => {});
  unlocked.forEach((a, i) => setTimeout(() => achievementToast(a.title, a.desc), 800 + i * 400));
}
