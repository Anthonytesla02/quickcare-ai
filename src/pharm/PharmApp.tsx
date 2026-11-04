import React, { useState, useEffect } from 'react';
import { CaseEvaluationResult, ClinicalCase, IdentityProfile } from './types/clinical';
import { INITIAL_IDP_PROFILE, updateProfileWithResult } from './game/rules';
import {
  CASE_LIBRARY, generateBatch5Challenges, getDailyChallengeCase, getWeeklyChallengeCase, getDateKey, getWeekKey
} from './data/caseLibrary';
import { ChallengeDashboard } from './components/challenge/ChallengeDashboard';
import { SimulationView } from './components/challenge/SimulationView';
import { DebriefView } from './components/challenge/DebriefView';
import { LearningTab } from './components/learning/LearningTab';
import { ProfileTab } from './components/profile/ProfileTab';
import { Activity, BookOpen, UserRound, ShieldPlus } from 'lucide-react';

const STORAGE_PROFILE_KEY = 'pharm_emerg_idp_profile_v2';
const STORAGE_SESSION_KEY = 'pharm_emerg_in_flight_case';
const STORAGE_CASES_KEY = 'pharm_emerg_dashboard_cases_v5';

type AppTab = 'challenge' | 'learning' | 'profile';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('challenge');
  const [simState, setSimState] = useState<'dashboard' | 'simulating' | 'debrief'>('dashboard');
  const [profile, setProfile] = useState<IdentityProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PROFILE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) { console.warn('Failed to parse saved IDP profile:', e); }
    return INITIAL_IDP_PROFILE;
  });
  const [activeCase, setActiveCase] = useState<ClinicalCase | null>(null);
  const [lastResult, setLastResult] = useState<CaseEvaluationResult | null>(null);
  const [hasUnfinishedSession, setHasUnfinishedSession] = useState(() => Boolean(localStorage.getItem(STORAGE_SESSION_KEY)));
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [dashboardCases, setDashboardCases] = useState<ClinicalCase[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CASES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { console.warn('Failed to parse dashboard cases from localStorage:', e); }
    return CASE_LIBRARY;
  });
  const [currentDateKey, setCurrentDateKey] = useState(() => getDateKey(new Date()));
  const [currentWeekKey, setCurrentWeekKey] = useState(() => getWeekKey(new Date()));
  const [dailyCase, setDailyCase] = useState(() => getDailyChallengeCase(new Date()));
  const [weeklyCase, setWeeklyCase] = useState(() => getWeeklyChallengeCase(new Date()));
  const isSimulationActive = simState === 'simulating';

  useEffect(() => {
    const checkRollover = () => {
      const now = new Date();
      const todayKey = getDateKey(now);
      const weekKey = getWeekKey(now);
      if (todayKey !== currentDateKey) { setCurrentDateKey(todayKey); setDailyCase(getDailyChallengeCase(now)); }
      if (weekKey !== currentWeekKey) { setCurrentWeekKey(weekKey); setWeeklyCase(getWeeklyChallengeCase(now)); }
    };
    const interval = setInterval(checkRollover, 15000);
    return () => clearInterval(interval);
  }, [currentDateKey, currentWeekKey]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile)); }
    catch (e) { console.warn('Failed to save profile to localStorage:', e); }
  }, [profile]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_CASES_KEY, JSON.stringify(dashboardCases)); }
    catch (e) { console.warn('Failed to save dashboard cases to localStorage:', e); }
  }, [dashboardCases]);

  const handleStartCase = (clinicalCase: ClinicalCase) => {
    setActiveCase(clinicalCase);
    setSimState('simulating');
    setActiveTab('challenge');
    setLastResult(null);
    try {
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify({ caseId: clinicalCase.id }));
      setHasUnfinishedSession(true);
    } catch (e) { console.warn('Session save failed:', e); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') handleStartCase(dashboardCases[0] || CASE_LIBRARY[0]);
  }, [dashboardCases]);

  const handleResumeSession = () => {
    try {
      const saved = localStorage.getItem(STORAGE_SESSION_KEY);
      if (saved) {
        const { caseId } = JSON.parse(saved);
        const found = dashboardCases.find(c => c.id === caseId) || CASE_LIBRARY.find(c => c.id === caseId) || CASE_LIBRARY[0];
        handleStartCase(found);
      }
    } catch { handleStartCase(CASE_LIBRARY[0]); }
  };
  const handleFinishCase = (result: CaseEvaluationResult) => {
    if (!activeCase) return;
    setProfile(updateProfileWithResult(profile, result, activeCase.id, activeCase.title, activeCase.category));
    setLastResult(result);
    setSimState('debrief');
    try { localStorage.removeItem(STORAGE_SESSION_KEY); setHasUnfinishedSession(false); }
    catch (e) { console.warn('Error clearing session:', e); }
  };
  const handleNextCase = () => {
    if (!activeCase) { setSimState('dashboard'); return; }
    const currentIndex = dashboardCases.findIndex(c => c.id === activeCase.id);
    handleStartCase(dashboardCases[(currentIndex + 1) % dashboardCases.length] || CASE_LIBRARY[0]);
  };
  const handleGenerateBatch5 = () => {
    setIsGeneratingBatch(true);
    // Yield once so the in-progress state can paint before the local batch generator runs.
    window.setTimeout(() => {
      try { setDashboardCases(prev => [...prev, ...generateBatch5Challenges(Date.now())]); }
      catch (err) { console.error('Error generating batch 5 challenges:', err); }
      finally { setIsGeneratingBatch(false); }
    }, 0);
  };
  const selectTab = (tab: AppTab) => {
    setActiveTab(tab);
  };
  const navItems = [
    { id: 'challenge' as const, label: 'Challenge', icon: Activity },
    { id: 'learning' as const, label: 'Learning', icon: BookOpen },
    { id: 'profile' as const, label: 'Profile', icon: UserRound }
  ];

  return (
    <div className="app-shell flex w-full flex-col text-slate-900 selection:bg-emerald-100 selection:text-emerald-950">
        <header className={`app-header sticky top-0 z-40 w-full border-b ${isSimulationActive && activeTab === 'challenge' ? 'simulation-context-header' : ''}`}>
          <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
            <button
              type="button"
              data-testid="button-brand-home"
              onClick={() => selectTab('challenge')}
              className="flex min-w-0 items-center gap-3 border-0 bg-transparent text-left"
              aria-label="PharmEmerg challenge hub"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#dff0e9] text-[#156d63]">
                <ShieldPlus size={21} strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block font-black leading-tight tracking-[-.04em] text-[#183b39]">PharmEmerg</span>
                <span className="hidden text-[10px] font-semibold tracking-wide text-[#70837e] sm:block">POCKET CLINICAL COACH</span>
              </span>
            </button>
            <nav className="hidden items-center gap-1 rounded-2xl border border-[#e1eae5] bg-[#f5f8f5] p-1 md:flex" aria-label="Main navigation">
              {navItems.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" data-testid={`nav-${id}`} onClick={() => selectTab(id)}
                  aria-current={activeTab === id ? 'page' : undefined}
                  className={`flex min-h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold transition ${activeTab === id ? 'bg-white text-[#176f64] shadow-sm' : 'text-[#687d77] hover:text-[#183b39]'}`}>
                  <Icon size={15} />{label}
                </button>
              ))}
            </nav>
            <button type="button" data-testid="button-profile-summary" onClick={() => selectTab('profile')}
              className="flex items-center gap-2 rounded-full border border-[#dce7e2] bg-white py-1.5 pl-3 pr-1.5 transition hover:bg-[#f5f8f5]">
              <span className="text-right leading-tight">
                <span className="block text-[10px] font-bold text-[#34534e]">Level {profile.level}</span>
                <span className="font-mono text-[10px] font-semibold text-[#a66d1e]">{profile.currentXp} XP</span>
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#dff0e9] text-xs font-black text-[#176f64]">{profile.username.charAt(0)}</span>
            </button>
          </div>
        </header>

      <main className={`app-main mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-6 sm:py-6 ${isSimulationActive && activeTab === 'challenge' ? '!p-0' : ''}`}>
        {activeTab === 'challenge' && <>
          {simState === 'dashboard' && <ChallengeDashboard profile={profile} onStartCase={handleStartCase}
            hasUnfinishedSession={hasUnfinishedSession} onResumeSession={handleResumeSession} dashboardCases={dashboardCases}
            onGenerateBatch5={handleGenerateBatch5} isGeneratingBatch={isGeneratingBatch} dailyCase={dailyCase} weeklyCase={weeklyCase} />}
          {simState === 'debrief' && activeCase && lastResult && <DebriefView clinicalCase={activeCase} result={lastResult}
            profile={profile} onRetry={() => handleStartCase(activeCase)} onNextCase={handleNextCase}
            onReturnDashboard={() => setSimState('dashboard')} onOpenGuidelines={() => setActiveTab('learning')} />}
        </>}
        {simState === 'simulating' && activeCase && (
          <div className={activeTab === 'challenge' ? 'contents' : 'hidden'} aria-hidden={activeTab !== 'challenge'}>
            <SimulationView clinicalCase={activeCase} profile={profile}
              onFinishCase={handleFinishCase} onExit={() => setSimState('dashboard')} />
          </div>
        )}
        {activeTab === 'learning' && <LearningTab />}
        {activeTab === 'profile' && <ProfileTab profile={profile} onResetProfile={() => setProfile(INITIAL_IDP_PROFILE)} />}
      </main>

      <nav className="bottom-dock" aria-label="App navigation">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" data-testid={`mobile-nav-${id}`} onClick={() => selectTab(id)}
            aria-current={activeTab === id ? 'page' : undefined}>
            <Icon size={19} strokeWidth={activeTab === id ? 2.3 : 1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
