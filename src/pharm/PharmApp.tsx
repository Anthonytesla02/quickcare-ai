// @ts-nocheck -- ported legacy module; written for a less strict TS config
import React, { useState, useEffect, useRef } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getNextCases } from './cases.functions';
import { CaseEvaluationResult, ClinicalCase, IdentityProfile } from './types/clinical';
import { INITIAL_IDP_PROFILE, updateProfileWithResult } from './game/rules';
import {
  CASE_LIBRARY, getDailyChallengeCase, getWeeklyChallengeCase, getDateKey, getWeekKey
} from './data/caseLibrary';
import { ChallengeDashboard } from './components/challenge/ChallengeDashboard';
import { SimulationView } from './components/challenge/SimulationView';
import { DebriefView } from './components/challenge/DebriefView';
import { LearningTab } from './components/learning/LearningTab';
import { ProfileTab } from './components/profile/ProfileTab';
import { Activity, BookOpen, UserRound, ShieldPlus, LogOut } from 'lucide-react';

const STORAGE_SESSION_KEY = 'pharm_emerg_in_flight_case';

type AppTab = 'challenge' | 'learning' | 'profile';

export default function App({ userId, email }: { userId: string; email: string }) {
  const fetchNextCases = useServerFn(getNextCases);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const [activeTab, setActiveTab] = useState<AppTab>('challenge');
  const [simState, setSimState] = useState<'dashboard' | 'simulating' | 'debrief'>('dashboard');
  const [profile, setProfile] = useState<IdentityProfile>(() => ({ ...INITIAL_IDP_PROFILE, username: email.split('@')[0] || INITIAL_IDP_PROFILE.username }));
  const [activeCase, setActiveCase] = useState<ClinicalCase | null>(null);
  const [lastResult, setLastResult] = useState<CaseEvaluationResult | null>(null);
  const [hasUnfinishedSession, setHasUnfinishedSession] = useState(false);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [dashboardCases, setDashboardCases] = useState<ClinicalCase[]>(CASE_LIBRARY);

  // Load this account's own progress + its assigned shared cases.
  useEffect(() => {
    let cancelled = false;
    setHasUnfinishedSession(Boolean(localStorage.getItem(`${STORAGE_SESSION_KEY}_${userId}`)));
    (async () => {
      const { data: prog } = await supabase.from('user_progress').select('profile, dashboard_case_ids').eq('user_id', userId).maybeSingle();
      let extra: ClinicalCase[] = [];
      const ids = prog?.dashboard_case_ids ?? [];
      if (ids.length) {
        const { data: rows } = await supabase.from('global_cases').select('id, case_data').in('id', ids);
        const byId = new Map((rows ?? []).map(r => [r.id, r.case_data as unknown as ClinicalCase]));
        extra = ids.map(id => byId.get(id)).filter((c): c is ClinicalCase => Boolean(c));
      }
      if (cancelled) return;
      if (prog?.profile) setProfile(prog.profile as unknown as IdentityProfile);
      setDashboardCases([...CASE_LIBRARY, ...extra]);
      loadedRef.current = true;
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Persist progress for this account only.
  useEffect(() => {
    if (!loadedRef.current) return;
    const libIds = new Set(CASE_LIBRARY.map(c => c.id));
    const t = window.setTimeout(() => {
      supabase.from('user_progress').upsert({
        user_id: userId,
        profile: profile as never,
        dashboard_case_ids: dashboardCases.filter(c => !libIds.has(c.id)).map(c => c.id),
        updated_at: new Date().toISOString(),
      }).then(({ error }) => { if (error) console.warn('Failed to save progress:', error.message); });
    }, 400);
    return () => window.clearTimeout(t);
  }, [profile, dashboardCases, userId, loaded]);

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

  const handleStartCase = (clinicalCase: ClinicalCase) => {
    setActiveCase(clinicalCase);
    setSimState('simulating');
    setActiveTab('challenge');
    setLastResult(null);
    try {
      localStorage.setItem(`${STORAGE_SESSION_KEY}_${userId}`, JSON.stringify({ caseId: clinicalCase.id }));
      setHasUnfinishedSession(true);
    } catch (e) { console.warn('Session save failed:', e); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') handleStartCase(dashboardCases[0] || CASE_LIBRARY[0]);
  }, [dashboardCases]);

  const handleResumeSession = () => {
    try {
      const saved = localStorage.getItem(`${STORAGE_SESSION_KEY}_${userId}`);
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
    supabase.from('user_case_attempts').insert({ user_id: userId, case_id: activeCase.id, score: Math.round(result.score), result: result as never })
      .then(({ error }) => { if (error) console.warn('Failed to record attempt:', error.message); });
    setLastResult(result);
    setSimState('debrief');
    try { localStorage.removeItem(`${STORAGE_SESSION_KEY}_${userId}`); setHasUnfinishedSession(false); }
    catch (e) { console.warn('Error clearing session:', e); }
  };
  const handleNextCase = () => {
    if (!activeCase) { setSimState('dashboard'); return; }
    const currentIndex = dashboardCases.findIndex(c => c.id === activeCase.id);
    handleStartCase(dashboardCases[(currentIndex + 1) % dashboardCases.length] || CASE_LIBRARY[0]);
  };
  const handleGenerateBatch5 = async () => {
    if (isGeneratingBatch) return;
    setIsGeneratingBatch(true);
    try {
      const res = await fetchNextCases({ data: { count: 5, excludeIds: dashboardCases.map(c => c.id) } });
      setDashboardCases(prev => {
        const have = new Set(prev.map(c => c.id));
        return [...prev, ...res.cases.filter(c => !have.has(c.id))];
      });
      toast.success(`${res.cases.length} new case${res.cases.length === 1 ? '' : 's'} added`, {
        description: res.reused ? `${res.reused} from the shared library, ${res.generated} newly generated` : 'Freshly generated by AI',
      });
    } catch (err) {
      console.error('Error loading new cases:', err);
      toast.error(err instanceof Error ? err.message : 'Could not load new cases');
    } finally { setIsGeneratingBatch(false); }
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
              aria-label="QuickCare AI challenge hub"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#dff0e9] text-[#156d63]">
                <ShieldPlus size={21} strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block font-black leading-tight tracking-[-.04em] text-[#183b39]">QuickCare AI</span>
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
            <button type="button" aria-label="Sign out" onClick={() => supabase.auth.signOut()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#dce7e2] bg-white text-[#687d77] transition hover:bg-[#f5f8f5]">
              <LogOut size={16} />
            </button>
          </div>
        </header>

      {!loaded && <div className="mx-auto w-full max-w-7xl space-y-3 px-3 py-4"><div className="skeleton h-28" /><div className="skeleton h-40" /><div className="skeleton h-40" /></div>}
      {loaded && <main className={`app-main mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-6 sm:py-6 ${isSimulationActive && activeTab === 'challenge' ? '!p-0' : ''}`}>
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
      </main>}

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
