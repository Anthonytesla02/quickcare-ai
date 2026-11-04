import React, { useState, useEffect, useRef } from 'react';
import { 
  AppliedAction, 
  BodyRegion, 
  CaseEvaluationResult, 
  ClinicalCase, 
  IdentityProfile, 
  PatientConditionState, 
  SupplyItem 
} from '../../types/clinical';
import { Patient2DScene } from '../patient/Patient2DScene';
import { evaluateCasePerformance } from '../../game/rules';
import { 
  Clock, 
  Heart, 
  Activity, 
  Droplet, 
  Wind, 
  Thermometer, 
  AlertTriangle, 
  CheckCircle2, 
  PhoneCall, 
  Sparkles, 
  ArrowRight, 
  ArrowLeft,
  Check, 
  X,
  Pill,
  ChevronDown,
  ChevronUp,
  History,
  Shield,
} from 'lucide-react';

interface SimulationViewProps {
  clinicalCase: ClinicalCase;
  profile: IdentityProfile;
  onFinishCase: (result: CaseEvaluationResult) => void;
  onExit: () => void;
}

export const SimulationView: React.FC<SimulationViewProps> = ({
  clinicalCase,
  profile,
  onFinishCase,
  onExit
}) => {
  const [selectedRegion, setSelectedRegion] = useState<BodyRegion>(clinicalCase.affectedBodyRegion);
  const [selectedSupply, setSelectedSupply] = useState<SupplyItem | null>(null);
  const [appliedActions, setAppliedActions] = useState<AppliedAction[]>([]);
  const [appliedSuppliesOnRegions, setAppliedSuppliesOnRegions] = useState<Record<string, string[]>>({});
  const [conditionState, setConditionState] = useState<PatientConditionState>('initial');
  const [supplyCategoryFilter, setSupplyCategoryFilter] = useState<string>('all');
  
  const [activePhase, setActivePhase] = useState<'assessment' | 'treatment'>('assessment');

  // Accordion folds state
  const [isFindingsFoldOpen, setIsFindingsFoldOpen] = useState<boolean>(true);
  const [isActionsFoldOpen, setIsActionsFoldOpen] = useState<boolean>(true);
  
  // Timer state
  const hasTimer = Boolean(clinicalCase.timeLimitSeconds);
  const [timeLeft, setTimeLeft] = useState<number>(clinicalCase.timeLimitSeconds || 120);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Vitals state
  const [vitals, setVitals] = useState(clinicalCase.initialVitals);
  const [escalatedToEMS, setEscalatedToEMS] = useState<boolean>(false);
  const [showMedModal, setShowMedModal] = useState<boolean>(false);
  const [medConfig, setMedConfig] = useState({
    dose: '',
    route: '',
    frequency: 'Stat'
  });

  // Urgency & symptoms flags
  const isSeizing = clinicalCase.injuryType === 'seizure' && conditionState !== 'stabilized' && conditionState !== 'recovery_positioned';
  const isWheezing = clinicalCase.injuryType === 'asthma' && conditionState !== 'stabilized' && conditionState !== 'reliever_given';
  const hasAngioedema = clinicalCase.injuryType === 'anaphylaxis' && conditionState !== 'stabilized' && conditionState !== 'epinephrine_given';

  // Run timer
  useEffect(() => {
    if (!hasTimer || isPaused) return;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleCompleteCase();
          return 0;
        }
        return prev - 1;
      });
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [hasTimer, isPaused, appliedActions]);

  // Track elapsed time for untimed cases too
  useEffect(() => {
    if (hasTimer) return;
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [hasTimer]);

  const handleSelectSupply = (supply: SupplyItem) => {
    setSelectedSupply(supply);
    if (supply.category === 'medication') {
      if (supply.id === 'epinephrine_adult') {
        setMedConfig({ dose: '0.3 mg', route: 'Intramuscular (Anterolateral Thigh)', frequency: 'Stat' });
      } else if (supply.id === 'epinephrine_pediatric') {
        setMedConfig({ dose: '0.15 mg', route: 'Intramuscular (Anterolateral Thigh)', frequency: 'Stat' });
      } else if (supply.id === 'salbutamol_inhaler') {
        setMedConfig({ dose: '4-8 puffs via spacer', route: 'Inhalation', frequency: 'Stat, repeated every 20m PRN' });
      } else if (supply.id === 'oral_cetirizine') {
        setMedConfig({ dose: '10 mg', route: 'Oral', frequency: 'Once daily' });
      } else if (supply.id === 'oral_paracetamol') {
        setMedConfig({ dose: '1000 mg', route: 'Oral', frequency: 'Q6H PRN' });
      } else if (supply.id === 'oral_ibuprofen') {
        setMedConfig({ dose: '400 mg', route: 'Oral', frequency: 'TDS with meals' });
      }
      setShowMedModal(true);
    }
  };

  const handleApplySupply = (supplyToApply: SupplyItem = selectedSupply!) => {
    if (!supplyToApply) return;

    const target = selectedRegion || clinicalCase.affectedBodyRegion;
    const isHarmful = Boolean(supplyToApply.isHarmful);
    const isContraindicated = clinicalCase.rubric.prohibitedSupplyIds.includes(supplyToApply.id);
    const isEssential = clinicalCase.rubric.requiredSupplyIds.includes(supplyToApply.id);

    let feedback = '';
    if (isHarmful || isContraindicated) {
      if (supplyToApply.id === 'induce_vomiting') {
        feedback = 'CRITICAL ERROR: Inducing vomiting in hydrocarbon/caustic poisoning risks chemical pneumonitis.';
      } else if (supplyToApply.id === 'snakebite_tourniquet') {
        feedback = 'CRITICAL ERROR: Tourniquets are strictly contraindicated in snakebite as they cause ischemic necrosis.';
      } else if (supplyToApply.id === 'tilt_head_back') {
        feedback = 'CRITICAL ERROR: Tilting head backwards causes airway aspiration and hematemesis.';
      } else {
        feedback = `HAZARD WARNING: Contraindicated intervention: ${supplyToApply.name}.`;
      }
    } else if (isEssential) {
      if (supplyToApply.id === 'arterial_tourniquet') {
        feedback = 'EXCELLENT: Combat arterial tourniquet applied 5cm proximal to arterial bleeding site. Hemorrhage halted!';
      } else if (supplyToApply.id === 'epinephrine_adult' || supplyToApply.id === 'epinephrine_pediatric') {
        feedback = 'LIFE-SAVING: Intramuscular epinephrine administered into anterolateral thigh. Airway edema halting!';
      } else if (supplyToApply.id === 'cool_water') {
        feedback = 'ACCURATE: Immediate continuous low-pressure cool water irrigation initiated for 20 minutes.';
      } else if (supplyToApply.id === 'burn_cling_film') {
        feedback = 'CORRECT: Sterile non-adherent clear burn sheet loosely applied over burn wound.';
      } else if (supplyToApply.id === 'padded_splint') {
        feedback = 'APPROPRIATE: Rigid padded splint immobilized joints above and below fracture.';
      } else {
        feedback = `Appropriate protocol: ${supplyToApply.name} applied to ${target.replace('_', ' ')}.`;
      }
    } else {
      feedback = `${supplyToApply.name} applied.`;
    }

    const newAction: AppliedAction = {
      id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      supplyId: supplyToApply.id,
      supplyName: supplyToApply.name,
      targetRegion: target,
      timestampSeconds: elapsedSeconds,
      isEssential,
      isHarmful,
      isContraindicated,
      clinicalFeedback: feedback
    };

    setAppliedActions(prev => [...prev, newAction]);

    // Update applied supplies dictionary
    setAppliedSuppliesOnRegions(prev => ({
      ...prev,
      [target]: [...(prev[target] || []), supplyToApply.id]
    }));

    // Dynamic physiological feedback updates
    if (supplyToApply.id === 'arterial_tourniquet' || supplyToApply.id === 'direct_pressure') {
      setVitals(v => ({ ...v, bloodPressure: '110/70', heartRate: Math.max(76, v.heartRate - 15) }));
      setConditionState('stabilized');
    } else if (supplyToApply.id === 'salbutamol_inhaler') {
      setVitals(v => ({ ...v, oxygenSaturation: Math.min(99, v.oxygenSaturation + 7), respiratoryRate: 18 }));
      setConditionState('reliever_given');
    } else if (supplyToApply.id === 'epinephrine_adult' || supplyToApply.id === 'epinephrine_pediatric') {
      setVitals(v => ({ ...v, bloodPressure: '115/75', oxygenSaturation: Math.min(99, v.oxygenSaturation + 5) }));
      setConditionState('epinephrine_given');
    } else if (supplyToApply.id === 'cool_water') {
      setConditionState('cooled');
    } else if (supplyToApply.id === 'burn_cling_film') {
      setConditionState('covered');
    } else if (supplyToApply.id === 'padded_splint') {
      setConditionState('splinted');
    }

    setSelectedSupply(null);
  };

  const handleEscalateEMS = () => {
    if (escalatedToEMS) return;
    setEscalatedToEMS(true);
    const emsAction: AppliedAction = {
      id: `act-ems-${Date.now()}`,
      supplyId: 'escalate_ems_call',
      supplyName: '112 / EMS Ambulance Dispatch Activated',
      targetRegion: 'head_face',
      timestampSeconds: elapsedSeconds,
      isEssential: clinicalCase.rubric.requiredSupplyIds.includes('escalate_ems_call'),
      isHarmful: false,
      isContraindicated: false,
      clinicalFeedback: 'Emergency medical services notified. Paramedic ambulance dispatched to pharmacy.'
    };
    setAppliedActions(prev => [...prev, emsAction]);
  };

  const handleCompleteCase = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const result = evaluateCasePerformance(
      clinicalCase,
      appliedActions,
      elapsedSeconds,
      escalatedToEMS,
      profile
    );
    onFinishCase(result);
  };

  const handleConfirmMedication = () => {
    if (!selectedSupply) return;
    setShowMedModal(false);
    handleApplySupply(selectedSupply);
  };

  const filteredSupplies = clinicalCase.availableSupplies.filter(supply => {
    if (supplyCategoryFilter === 'all') return true;
    if (supplyCategoryFilter === 'ppe') return supply.category === 'ppe';
    if (supplyCategoryFilter === 'wound_burn') return supply.category === 'wound_care' || supply.category === 'burn_care';
    if (supplyCategoryFilter === 'medication') return supply.category === 'medication';
    if (supplyCategoryFilter === 'procedure') return supply.category === 'procedure' || supply.category === 'airway_support';
    return true;
  });

  const openTreatmentPhase = () => {
    setActivePhase('treatment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const returnToAssessment = () => {
    setActivePhase('assessment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden min-h-[calc(100vh-5rem)] flex flex-col bg-slate-950 text-slate-100">
      {/* Simulation Header with Responsive Vitals & Controls */}
      <header className="sticky top-0 z-30 w-full max-w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col gap-2">
          {/* Top Row: Case Title + Actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={onExit}
                data-testid="button-exit-case"
                className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-700 transition cursor-pointer shrink-0"
              >
                ← Exit
              </button>
              <div className="min-w-0">
                <h1 className="font-bold text-xs sm:text-sm text-white truncate max-w-[200px] sm:max-w-md">
                  {clinicalCase.title}
                </h1>
                <div className="text-[10px] text-cyan-400 capitalize truncate">
                  {clinicalCase.category.replace('_', ' ')} • {clinicalCase.difficulty}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasTimer && (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border font-mono font-bold text-xs ${
                  timeLeft <= 30 
                    ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse' 
                    : 'bg-slate-800 text-amber-300 border-slate-700'
                }`}>
                  <Clock className="w-3.5 h-3.5" />
                  <span>{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
                </div>
              )}

              <button
                onClick={handleCompleteCase}
                data-testid="button-finish-case"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3 py-1.5 rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center gap-1.5 cursor-pointer"
              >
                <span className="hidden xs:inline sm:inline">Complete &</span> Debrief
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Bottom Row: Responsive Live Vitals Strip */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center gap-1.5 text-rose-400">
              <Heart className="w-3.5 h-3.5 animate-pulse" />
              <span className="font-mono font-bold">{vitals.heartRate} bpm</span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center gap-1.5 text-blue-400">
              <Activity className="w-3.5 h-3.5" />
              <span className="font-mono font-bold">{vitals.bloodPressure}</span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center gap-1.5 text-emerald-400">
              <Wind className="w-3.5 h-3.5" />
              <span className="font-mono font-bold">{vitals.oxygenSaturation}% SpO2</span>
            </div>
            <div className="h-3 w-px bg-slate-800" />
            <div className="flex items-center gap-1.5 text-cyan-400">
              <Thermometer className="w-3.5 h-3.5" />
              <span className="font-mono font-bold">{vitals.temperature}°C</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Simulation View Grid */}
      <main className="case-view-content flex-1 w-full max-w-7xl mx-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-x-hidden">
        {activePhase === 'assessment' && (
        <section className="lg:col-span-8 lg:col-start-3 flex flex-col gap-3">
          {/* Interactive 2D Patient Scene Canvas with Isolated Body Part */}
          <div className="w-full flex-1 min-h-[440px]">
            <Patient2DScene
              clinicalCase={clinicalCase}
              conditionState={conditionState}
              selectedRegion={selectedRegion}
              onSelectRegion={(r) => {
                setSelectedRegion(r);
                if (selectedSupply && selectedSupply.category !== 'medication') {
                  handleApplySupply(selectedSupply);
                }
              }}
              appliedSuppliesOnRegions={appliedSuppliesOnRegions}
              isSeizing={isSeizing}
              isWheezing={isWheezing}
              hasAngioedema={hasAngioedema}
            />
          </div>

          {/* Clinical Findings & Triage Guidance Collapsible Fold */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-md">
            <button
              type="button"
              onClick={() => setIsFindingsFoldOpen(!isFindingsFoldOpen)}
              aria-expanded={isFindingsFoldOpen}
              className="w-full p-3 flex items-center justify-between text-left text-xs font-semibold text-slate-300 hover:bg-slate-800/50 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-white uppercase tracking-wider">Physical Findings & Examination</span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  • Allergies: <strong className="text-amber-300">{clinicalCase.knownAllergies.join(', ') || 'NKDA'}</strong>
                </span>
              </div>
              {isFindingsFoldOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {isFindingsFoldOpen && (
              <div className="p-3 pt-0 border-t border-slate-800/80 space-y-2">
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300 text-xs">
                  {clinicalCase.visibleFindings.map((finding, idx) => (
                    <li key={idx} className="flex items-start gap-2 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                      <span className="text-xs leading-relaxed">{finding}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">Next phase · 2 of 2</p>
                <p className="mt-1 text-xs text-slate-500">Assessment complete? Continue to the treatment plan.</p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-emerald-700" />
            </div>
            <button
              type="button"
              onClick={openTreatmentPhase}
              data-testid="button-give-treatment"
              className="clinical-primary-action flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              Give Treatment
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
        )}

        {activePhase === 'treatment' && (
        <section className="lg:col-span-12 flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">Phase 2 of 2 · Treatment</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">Give Treatment</h2>
              <p className="mt-1 text-xs text-slate-500">Choose interventions and monitor the patient’s response.</p>
            </div>
            <button
              type="button"
              onClick={returnToAssessment}
              data-testid="button-back-to-examination"
              className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:self-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to examination
            </button>
          </div>

          {/* Urgent Escalation Action Bar */}
          <div className="bg-gradient-to-r from-red-950/60 via-slate-900 to-slate-900 border border-red-500/30 rounded-2xl p-3 flex items-center justify-between gap-2 shadow-lg">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${escalatedToEMS ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                <PhoneCall className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Emergency Services</div>
                <div className="text-[10px] text-slate-400">
                  {escalatedToEMS ? 'EMS Ambulance Dispatched' : 'Activate 112 / EMS Dispatch'}
                </div>
              </div>
            </div>

            <button
              onClick={handleEscalateEMS}
              data-testid="button-call-ems"
              disabled={escalatedToEMS}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                escalatedToEMS 
                  ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 cursor-default'
                  : 'bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-900/40'
              }`}
            >
              {escalatedToEMS ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Dispatched</span>
                </>
              ) : (
                <span>Call 112 EMS</span>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            {/* Supplies & Equipment Inventory */}
            <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/90 p-3 lg:col-span-7">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Medical Supplies & Interventions
                </h3>
                {selectedSupply && (
                  <button
                    type="button"
                    onClick={() => setSelectedSupply(null)}
                    className="text-[10px] text-slate-400 hover:text-white"
                  >
                    Clear Selection
                  </button>
                )}
              </div>

              {/* Inventory Category Filter Tabs (Wrapping gracefully) */}
              <div className="flex flex-wrap items-center gap-1 pb-2 text-[11px]">
                {[
                  { id: 'all', label: 'All Items' },
                  { id: 'ppe', label: 'PPE' },
                  { id: 'wound_burn', label: 'Wound & Burn' },
                  { id: 'medication', label: 'Medications' },
                  { id: 'procedure', label: 'Procedures' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSupplyCategoryFilter(tab.id)}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                      supplyCategoryFilter === tab.id
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Selected supply prompt if ready to apply */}
              {selectedSupply && (
                <div className="mb-2 flex items-center justify-between rounded-xl border border-cyan-500/40 bg-cyan-950/80 p-2.5 text-xs">
                  <div>
                    <span className="block text-[10px] font-semibold uppercase text-cyan-300">Active Supply:</span>
                    <span className="font-bold text-white">{selectedSupply.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplySupply(selectedSupply)}
                    className="rounded-lg bg-cyan-600 px-3 py-1.5 text-[11px] font-bold text-white shadow transition hover:bg-cyan-500"
                  >
                    Apply to {selectedRegion.replace('_', ' ')}
                  </button>
                </div>
              )}

              {/* Supply Cards Grid */}
              <div className="grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-2">
                {filteredSupplies.map(supply => {
                  const isSelected = selectedSupply?.id === supply.id;
                  const isAlreadyApplied = appliedActions.some(a => a.supplyId === supply.id);
                  const isHazard = supply.isHarmful;

                  return (
                    <button
                      key={supply.id}
                      type="button"
                      onClick={() => handleSelectSupply(supply)}
                      data-testid={`button-supply-${supply.id}`}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-950/90 shadow-md shadow-cyan-900/30'
                          : isAlreadyApplied
                          ? 'border-slate-700/60 bg-slate-800/40 opacity-80'
                          : isHazard
                          ? 'border-slate-700/80 bg-slate-900/80 hover:border-amber-500/40'
                          : 'border-slate-800 bg-slate-900/80 hover:border-slate-700 hover:bg-slate-800/50'
                      }`}
                    >
                      <div className={`mt-0.5 shrink-0 rounded-lg border p-2 ${
                        isHazard ? 'border-amber-800/40 bg-amber-950/50 text-amber-400' :
                        supply.category === 'medication' ? 'border-purple-800/40 bg-purple-950/50 text-purple-400' :
                        'border-cyan-800/40 bg-cyan-950/50 text-cyan-400'
                      }`}>
                        {supply.category === 'medication' ? <Pill className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-slate-100">{supply.name}</div>
                        <div className="line-clamp-2 text-[10px] leading-tight text-slate-400">{supply.description}</div>
                        {isAlreadyApplied && (
                          <span className="mt-1 inline-block text-[9px] font-bold text-emerald-400">✓ Applied</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Applied Actions Feed / Procedure Log Fold */}
            <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-md lg:col-span-5">
              <button
                type="button"
                onClick={() => setIsActionsFoldOpen(!isActionsFoldOpen)}
                aria-expanded={isActionsFoldOpen}
                className="flex w-full items-center justify-between p-3 text-left text-xs font-bold text-slate-300 transition hover:bg-slate-800/50"
              >
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-cyan-400" />
                  <span className="uppercase tracking-wider">Procedure Actions Log ({appliedActions.length})</span>
                  <span className="font-mono text-[10px] text-slate-400">({elapsedSeconds}s)</span>
                </div>
                {isActionsFoldOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </button>

              {isActionsFoldOpen && (
                <div className="border-t border-slate-800/80 p-3 pt-0">
                  {appliedActions.length === 0 ? (
                    <div className="py-4 text-center text-xs italic text-slate-500">
                      No actions performed yet. Select protective gloves or first aid supplies to begin.
                    </div>
                  ) : (
                    <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
                      {appliedActions.map((action) => (
                        <div
                          key={action.id}
                          className={`flex items-start gap-2 rounded-xl border p-2.5 text-xs ${
                            action.isHarmful || action.isContraindicated
                              ? 'border-red-500/50 bg-red-950/40 text-red-200'
                              : action.isEssential
                              ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                              : 'border-slate-800 bg-slate-950/60 text-slate-300'
                          }`}
                        >
                          <span className="mt-0.5 shrink-0 font-mono text-[10px] text-slate-400">
                            {action.timestampSeconds}s
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                              {action.isHarmful || action.isContraindicated ? (
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                              ) : action.isEssential ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                              ) : null}
                              <span className="truncate">{action.supplyName}</span>
                            </div>
                            <div className="mt-0.5 text-[11px] leading-tight text-slate-300">
                              {action.clinicalFeedback}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
        )}
      </main>

      {/* Medication Administration Modal */}
      {showMedModal && selectedSupply && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-950 text-purple-400 border border-purple-800">
                  <Pill className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">{selectedSupply.name}</h3>
                  <span className="text-[11px] text-slate-400">Medication Safety Verification</span>
                </div>
              </div>
              <button
                onClick={() => setShowMedModal(false)}
                data-testid="button-close-medication-check"
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Dose Specification</label>
                <input
                  type="text"
                  value={medConfig.dose}
                  onChange={(e) => setMedConfig({ ...medConfig, dose: e.target.value })}
                  data-testid="input-medication-dose"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  placeholder="e.g. 0.3 mg, 4 puffs, 1000 mg"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Route of Administration</label>
                <input
                  type="text"
                  value={medConfig.route}
                  onChange={(e) => setMedConfig({ ...medConfig, route: e.target.value })}
                  data-testid="input-medication-route"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  placeholder="e.g. Intramuscular (Anterolateral Thigh), Inhalation via Spacer"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Administration Frequency</label>
                <select
                  value={medConfig.frequency}
                  onChange={(e) => setMedConfig({ ...medConfig, frequency: e.target.value })}
                  data-testid="select-medication-frequency"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="Stat">Stat (Immediate once-off emergency dose)</option>
                  <option value="Repeat in 5-15 min PRN">Repeat in 5-15 min if unresolving</option>
                  <option value="Q4-6H PRN">Every 4-6 hours PRN</option>
                  <option value="Once daily">Once daily</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowMedModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMedication}
                data-testid="button-confirm-medication"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg transition cursor-pointer"
              >
                Confirm & Administer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
