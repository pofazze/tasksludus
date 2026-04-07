import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Zap, Lock, TrendingUp, DollarSign, Target, Rocket, ArrowUp } from 'lucide-react';

const DEFAULT_BASE = 15;
const DEFAULT_CAP = 2.0;
const EXAMPLE_SALARY = 4000;
const MIN_EXCESS = 10;

function getMultiplier(totalDeliveries, base, cap = DEFAULT_CAP) {
  const excess = Math.max(0, totalDeliveries - base);
  if (excess < MIN_EXCESS) return 0;
  const mult = Math.min(excess / base, cap);
  return parseFloat(mult.toFixed(2));
}

function buildChartData(base, cap) {
  const maxX = Math.ceil(base * (1 + cap) + 5);
  const data = [];
  for (let d = 0; d <= maxX; d++) {
    const mult = getMultiplier(d, base, cap);
    const excess = Math.max(0, d - base);
    data.push({
      entregas: d,
      multiplicador: mult,
      excedente: excess,
      bloqueado: excess < MIN_EXCESS,
    });
  }
  return data;
}

const STEPS = [
  {
    icon: Target,
    color: '#3B82F6',
    title: 'Entrega Base',
    desc: 'Cada cargo tem uma quantidade mínima de entregas (a "base"). Abaixo disso, não há boost.',
  },
  {
    icon: Lock,
    color: '#F97316',
    title: 'Mínimo de 10 a mais',
    desc: 'O multiplicador só ativa quando você ultrapassa a base em pelo menos 10 entregas.',
  },
  {
    icon: TrendingUp,
    color: '#9A48EA',
    title: 'Crescimento Linear',
    desc: 'A cada entrega extra, o multiplicador sobe proporcionalmente. Se dobrar a base, o salário dobra.',
  },
  {
    icon: DollarSign,
    color: '#22C55E',
    title: 'Boost',
    desc: 'Boost = Salário × Multiplicador. O multiplicador tem um teto (ex: 2.0x) para manter o equilíbrio.',
  },
];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-muted/95 dark:bg-[#141418]/95 backdrop-blur-sm px-3.5 py-2.5 shadow-xl">
      <p className="text-xs text-muted-foreground mb-1">{d.entregas} entregas ({d.excedente} excedentes)</p>
      {d.bloqueado ? (
        <p className="text-sm font-semibold text-[#EF4444] flex items-center gap-1.5">
          <Lock size={12} /> {d.excedente < 1 ? 'Abaixo da base' : `Faltam ${MIN_EXCESS - d.excedente} para ativar`}
        </p>
      ) : (
        <>
          <p className="text-sm font-bold text-[#C084FC]">{d.multiplicador}x</p>
          <p className="text-[11px] text-muted-foreground">
            Boost: R$ {(EXAMPLE_SALARY * d.multiplicador).toLocaleString('pt-BR')}
          </p>
        </>
      )}
    </div>
  );
};

export default function BoostPage() {
  const [base, setBase] = useState(DEFAULT_BASE);
  const [sliderValue, setSliderValue] = useState(25);
  const cap = DEFAULT_CAP;

  const maxSlider = Math.ceil(base * (1 + cap) + 5);
  const chartData = useMemo(() => buildChartData(base, cap), [base, cap]);
  const currentMult = getMultiplier(sliderValue, base, cap);
  const currentBonus = EXAMPLE_SALARY * currentMult;
  const excess = Math.max(0, sliderValue - base);
  const isLocked = excess < MIN_EXCESS;
  const activationPoint = base + MIN_EXCESS;
  const doublePoint = base * 2;

  const pct = (sliderValue / maxSlider) * 100;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Rocket size={20} className="text-[#C084FC]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Como funciona o Boost</h1>
            <p className="text-sm text-muted-foreground">Multiplicador linear proporcional às suas entregas</p>
          </div>
        </div>
      </div>

      {/* Linear Chart */}
      <Card className="mb-6 overflow-hidden border-border">
        <CardContent className="pt-6 pb-2">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Multiplicador Linear</h2>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/40" /> Inativo
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#9A48EA]" /> Ativo
              </span>
              <label className="flex items-center gap-1.5 text-muted-foreground">
                Base:
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={base}
                  onChange={(e) => {
                    const v = Math.max(1, parseInt(e.target.value) || 1);
                    setBase(v);
                    if (sliderValue > Math.ceil(v * (1 + cap) + 5)) {
                      setSliderValue(Math.ceil(v * (1 + cap) + 5));
                    }
                  }}
                  className="w-14 rounded-md bg-muted border border-border px-2 py-0.5 text-xs text-white text-center focus:outline-none focus:border-primary"
                />
              </label>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="multGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9A48EA" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#9A48EA" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E1E23" vertical={false} />
              <XAxis
                dataKey="entregas"
                fontSize={11}
                tick={{ fill: '#52525B' }}
                axisLine={{ stroke: '#1E1E23' }}
                tickLine={false}
                label={{ value: 'Entregas', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: '#52525B' }}
              />
              <YAxis
                fontSize={11}
                tick={{ fill: '#52525B' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}x`}
                domain={[0, cap + 0.3]}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                x={base}
                stroke="#3B82F6"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{
                  value: `Base: ${base}`,
                  position: 'top',
                  fontSize: 11,
                  fill: '#3B82F6',
                  fontWeight: 600,
                }}
              />
              <ReferenceLine
                x={activationPoint}
                stroke="#F97316"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{
                  value: `Ativa: ${activationPoint}`,
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: '#F97316',
                }}
              />
              <ReferenceLine
                x={doublePoint}
                stroke="#22C55E"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{
                  value: `2×Base: ${doublePoint}`,
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill: '#22C55E',
                }}
              />
              {!isLocked && (
                <ReferenceDot
                  x={sliderValue}
                  y={currentMult}
                  r={6}
                  fill="#9A48EA"
                  stroke="#C084FC"
                  strokeWidth={2}
                />
              )}
              <Area
                type="monotone"
                dataKey="multiplicador"
                stroke="#9A48EA"
                strokeWidth={2.5}
                fill="url(#multGradient)"
                dot={false}
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Interactive Slider */}
      <Card className="mb-8 border-border">
        <CardContent className="pt-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-5">Simule suas entregas</h2>

          <div className="relative mb-6">
            <input
              type="range"
              min={0}
              max={maxSlider}
              value={sliderValue}
              onChange={(e) => setSliderValue(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${isLocked ? '#EF4444' : '#9A48EA'} 0%, ${isLocked ? '#EF4444' : '#9A48EA'} ${pct}%, #27272A ${pct}%, #27272A 100%)`,
              }}
            />
            <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
              <span>0</span>
              <span>{Math.round(maxSlider * 0.25)}</span>
              <span>{Math.round(maxSlider * 0.5)}</span>
              <span>{Math.round(maxSlider * 0.75)}</span>
              <span>{maxSlider}</span>
            </div>
          </div>

          {/* Result Display */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl bg-muted border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Entregas</p>
              <p className="text-3xl font-bold tracking-tight text-white">{sliderValue}</p>
            </div>
            <div className="rounded-xl bg-muted border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Excedente</p>
              <p className={`text-3xl font-bold tracking-tight ${excess >= MIN_EXCESS ? 'text-[#F97316]' : 'text-muted-foreground'}`}>
                {excess}
              </p>
            </div>
            <div className={`rounded-xl border p-4 text-center transition-colors duration-300 ${
              isLocked
                ? 'bg-red-500/5 border-red-500/20'
                : 'bg-primary/5 border-primary/20'
            }`}>
              <p className="text-xs text-muted-foreground mb-1">Multiplicador</p>
              {isLocked ? (
                <div className="flex items-center justify-center gap-1.5">
                  <Lock size={16} className="text-[#EF4444]" />
                  <span className="text-2xl font-bold text-[#EF4444]">0x</span>
                </div>
              ) : (
                <p className="text-3xl font-bold tracking-tight text-[#C084FC]">{currentMult}x</p>
              )}
            </div>
            <div className={`rounded-xl border p-4 text-center transition-colors duration-300 ${
              isLocked
                ? 'bg-muted dark:bg-[#141418] border-border'
                : 'bg-emerald-500/5 border-emerald-500/20'
            }`}>
              <p className="text-xs text-muted-foreground mb-1">Boost (ex: R$ 4k)</p>
              <p className={`text-2xl font-bold tracking-tight ${isLocked ? 'text-muted-foreground' : 'text-[#22C55E]'}`}>
                {isLocked ? '—' : `R$ ${currentBonus.toLocaleString('pt-BR')}`}
              </p>
            </div>
          </div>

          {isLocked && excess > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-orange-500/5 border border-orange-500/15 px-3.5 py-2.5">
              <ArrowUp size={14} className="text-[#F97316] shrink-0" />
              <p className="text-xs text-[#F97316]/80">
                Faltam <span className="font-bold text-[#F97316]">{MIN_EXCESS - excess}</span> entregas excedentes para ativar o multiplicador (mínimo {MIN_EXCESS})
              </p>
            </div>
          )}

          {isLocked && excess === 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/5 border border-red-500/15 px-3.5 py-2.5">
              <Lock size={14} className="text-[#EF4444] shrink-0" />
              <p className="text-xs text-[#EF4444]/80">
                {sliderValue < base
                  ? <>Faltam <span className="font-bold text-[#EF4444]">{base - sliderValue}</span> entregas para atingir a base</>
                  : <>Atinja pelo menos <span className="font-bold text-[#EF4444]">{activationPoint}</span> entregas para ativar o boost</>
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works — steps */}
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Como funciona</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {STEPS.map((step, i) => (
          <Card key={i} className="border-border group hover:border-border transition-colors">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: step.color + '15' }}
                >
                  <step.icon size={18} style={{ color: step.color }} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-muted-foreground bg-muted dark:bg-[#1E1E23] rounded-full w-5 h-5 flex items-center justify-center">
                      {i + 1}
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Formula breakdown */}
      <Card className="mb-8 border-border">
        <CardContent className="pt-6 pb-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-5">Fórmula</h2>

          {/* Formula explanation */}
          <div className="rounded-xl bg-muted border border-border p-5 mb-5">
            <div className="space-y-3 text-sm font-mono">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-muted-foreground">1.</span>
                <span className="text-muted-foreground">excedente</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-white">entregas</span>
                <span className="text-muted-foreground">-</span>
                <span className="text-[#3B82F6]">base</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-muted-foreground">2.</span>
                <span className="text-muted-foreground">multiplicador</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-[#F97316]">excedente</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-[#3B82F6]">base</span>
                <span className="text-[10px] text-muted-foreground ml-2">(se excedente &ge; 10)</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-muted-foreground">3.</span>
                <span className="text-[#22C55E]">boost</span>
                <span className="text-muted-foreground">=</span>
                <span className="text-white">salário</span>
                <span className="text-muted-foreground">&times;</span>
                <span className="text-[#C084FC]">multiplicador</span>
              </div>
            </div>
          </div>

          {/* Concrete example */}
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Exemplo prático (base: {base})</h3>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <div className="rounded-xl bg-muted border border-border px-4 py-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Entregas</p>
              <p className="text-lg font-bold text-white">{doublePoint}</p>
              <p className="text-[10px] text-[#3B82F6]">2× a base</p>
            </div>
            <span className="text-lg text-muted-foreground">&minus;</span>
            <div className="rounded-xl bg-muted border border-border px-4 py-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Base</p>
              <p className="text-lg font-bold text-[#3B82F6]">{base}</p>
            </div>
            <span className="text-lg text-muted-foreground">=</span>
            <div className="rounded-xl bg-orange-500/8 border border-orange-500/20 px-4 py-3 text-center">
              <p className="text-[10px] text-[#F97316]/60 uppercase tracking-wider mb-0.5">Excedente</p>
              <p className="text-lg font-bold text-[#F97316]">{base}</p>
            </div>
            <span className="text-lg text-muted-foreground">&divide;</span>
            <div className="rounded-xl bg-muted border border-border px-4 py-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Base</p>
              <p className="text-lg font-bold text-[#3B82F6]">{base}</p>
            </div>
            <span className="text-lg text-muted-foreground">=</span>
            <div className="rounded-xl bg-primary/8 border border-primary/20 px-4 py-3 text-center">
              <p className="text-[10px] text-[#9A48EA]/60 uppercase tracking-wider mb-0.5">Multiplicador</p>
              <p className="text-lg font-bold text-[#C084FC]">1.0x</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
            <div className="rounded-xl bg-muted border border-border px-5 py-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Salário Base</p>
              <p className="text-xl font-bold text-white">R$ 4.000</p>
            </div>
            <span className="text-2xl text-muted-foreground font-light">&times;</span>
            <div className="rounded-xl bg-primary/8 border border-primary/20 px-5 py-3 text-center">
              <p className="text-[10px] text-[#9A48EA]/60 uppercase tracking-wider mb-0.5">Multiplicador</p>
              <p className="text-xl font-bold text-[#C084FC]">1.0x</p>
            </div>
            <span className="text-2xl text-muted-foreground font-light">=</span>
            <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-5 py-3 text-center">
              <p className="text-[10px] text-[#22C55E]/60 uppercase tracking-wider mb-0.5">Boost</p>
              <p className="text-xl font-bold text-[#22C55E]">R$ 4.000</p>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-4">
            Salário total = R$ 4.000 + R$ 4.000 = <span className="text-[#22C55E] font-semibold">R$ 8.000</span>
          </p>
        </CardContent>
      </Card>

      {/* Key milestones */}
      <Card className="border-border">
        <CardContent className="pt-6 pb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Marcos Importantes (base: {base})</h2>
          <div className="space-y-1.5">
            {[
              { entregas: base, label: 'Entrega base', mult: 0, note: 'Sem boost', locked: true },
              { entregas: activationPoint, label: 'Ativação do boost', mult: getMultiplier(activationPoint, base, cap), note: 'Mínimo 10 excedentes', highlight: 'orange' },
              { entregas: Math.round(base * 1.5), label: '1.5× a base', mult: getMultiplier(Math.round(base * 1.5), base, cap), note: null, highlight: 'purple' },
              { entregas: doublePoint, label: 'Dobro da base', mult: getMultiplier(doublePoint, base, cap), note: 'Salário dobra', highlight: 'green' },
              { entregas: Math.round(base * (1 + cap)), label: `Teto (${cap}x)`, mult: cap, note: 'Multiplicador máximo', highlight: 'purple' },
            ].map((milestone, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-lg px-4 py-2.5 transition-colors ${
                  milestone.locked
                    ? 'bg-muted dark:bg-[#141418] text-muted-foreground'
                    : 'bg-primary/[0.04] hover:bg-primary/[0.08]'
                }`}
              >
                <div className="flex items-center gap-3">
                  {milestone.locked ? (
                    <Lock size={13} className="text-muted-foreground" />
                  ) : (
                    <Zap size={13} className="text-[#9A48EA]" />
                  )}
                  <span className={`text-sm font-medium ${milestone.locked ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                    {milestone.entregas} entregas
                  </span>
                  <span className="text-xs text-muted-foreground">{milestone.label}</span>
                  {milestone.note && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      milestone.highlight === 'orange' ? 'bg-orange-500/15 text-[#F97316]'
                        : milestone.highlight === 'green' ? 'bg-emerald-500/15 text-[#22C55E]'
                        : milestone.highlight === 'purple' ? 'bg-primary/15 text-[#C084FC]'
                        : 'bg-muted dark:bg-[#1E1E23] text-muted-foreground'
                    }`}>
                      {milestone.note}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${milestone.locked ? 'text-muted-foreground' : 'text-[#C084FC]'}`}>
                    {milestone.mult}x
                  </span>
                  {!milestone.locked && (
                    <span className="text-xs text-muted-foreground">
                      R$ {(EXAMPLE_SALARY * milestone.mult).toLocaleString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
