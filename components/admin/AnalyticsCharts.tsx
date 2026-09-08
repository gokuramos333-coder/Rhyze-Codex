'use client';

import Link from 'next/link';
import { useState } from 'react';
import { chartTooltip } from '@/lib/admin/chart-tooltip';

type Point = {
  label: string;
  value: number;
};

function exactMoney(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function RevenueAreaChart({
  points,
  title,
  emptyLabel = 'Revenue will appear as payments are recorded.',
  href = '/admin/payments',
}: {
  points: Point[];
  title: string;
  emptyLabel?: string;
  href?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 760;
  const height = 230;
  const paddingX = 28;
  const paddingY = 24;
  const max = Math.max(...points.map((point) => point.value), 0);
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const coordinates = points.map((point, index) => {
    const x =
      paddingX +
      (points.length <= 1 ? 0 : (index / (points.length - 1)) * chartWidth);
    const y =
      paddingY + chartHeight - (max ? (point.value / max) * chartHeight : 0);
    return { ...point, x, y };
  });
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(' ');
  const area = coordinates.length
    ? `${paddingX},${paddingY + chartHeight} ${line} ${paddingX + chartWidth},${paddingY + chartHeight}`
    : '';
  const activePoint = activeIndex === null ? null : coordinates[activeIndex];

  const chart = (
    <section className="border-t-4 border-rhyze-orange bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-rhyze-black/45">
            {title}
          </p>
          <strong className="mt-1 block font-display text-4xl tracking-wider">
            {exactMoney(points.reduce((sum, point) => sum + point.value, 0))}
          </strong>
        </div>
        {max > 0 && (
          <span className="text-xs font-bold text-rhyze-black/40">
            Peak {exactMoney(max)}
          </span>
        )}
      </div>
      {max > 0 ? (
        <>
          <div className="relative">
          {activePoint && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 bg-rhyze-black px-3 py-2 text-xs font-black text-white shadow-lg">
              {chartTooltip(activePoint.label, activePoint.value, 'money')}
            </div>
          )}
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${title} area graph`}
            className="mt-5 h-56 w-full"
            onPointerMove={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - bounds.left) / bounds.width;
              setActiveIndex(Math.max(0, Math.min(coordinates.length - 1, Math.round(ratio * (coordinates.length - 1)))));
            }}
            onPointerLeave={() => setActiveIndex(null)}
          >
            {[0, 1, 2, 3].map((step) => {
              const y = paddingY + (chartHeight / 3) * step;
              return (
                <line
                  key={step}
                  x1={paddingX}
                  x2={width - paddingX}
                  y1={y}
                  y2={y}
                  stroke="rgba(20,20,20,.12)"
                />
              );
            })}
            <polygon points={area} fill="rgba(247,147,30,.28)" />
            <polyline
              points={line}
              fill="none"
              stroke="#F05A3C"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            {coordinates.map((point, index) => (
              <circle
                key={`${point.label}-${index}`}
                cx={point.x}
                cy={point.y}
                r={activeIndex === index ? 8 : 5}
                fill="#F05A3C"
                stroke="white"
                strokeWidth="3"
                tabIndex={0}
                aria-label={chartTooltip(point.label, point.value, 'money')}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
              />
            ))}
          </svg>
          </div>
          <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-rhyze-black/40">
            <span>{points[0]?.label}</span>
            <span>{points.at(-1)?.label}</span>
          </div>
        </>
      ) : (
        <p className="mt-5 border border-dashed border-rhyze-orange/40 bg-rhyze-orange/10 p-8 text-sm font-bold text-rhyze-black/55">
          {emptyLabel}
        </p>
      )}
    </section>
  );
  return (
    <Link href={href} className="block transition hover:-translate-y-0.5 hover:shadow-lg">
      {chart}
    </Link>
  );
}

export function DistributionBars({
  title,
  items,
  href = '/admin/products',
}: {
  title: string;
  items: Point[];
  href?: string;
}) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((item) => item.value), 0);
  return (
    <Link href={href} className="block transition hover:-translate-y-0.5 hover:shadow-lg">
    <section className="border-t-4 border-rhyze-gold bg-white p-5">
      <p className="text-xs font-black uppercase tracking-widest text-rhyze-black/45">
        {title}
      </p>
      <div className="mt-5 grid gap-4">
        {sorted.map((item) => (
          <div
            key={item.label}
            tabIndex={0}
            className="relative outline-none focus:ring-2 focus:ring-rhyze-coral"
            onMouseEnter={() => setActiveLabel(item.label)}
            onMouseLeave={() => setActiveLabel(null)}
            onFocus={() => setActiveLabel(item.label)}
            onBlur={() => setActiveLabel(null)}
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-xs font-bold">
              <span>{item.label}</span>
              <span>{exactMoney(item.value)}</span>
            </div>
            <div className="h-3 bg-rhyze-orange/10">
              <div
                className="h-full bg-rhyze-gradient"
                style={{ width: `${max ? Math.max((item.value / max) * 100, 2) : 0}%` }}
              />
            </div>
            {activeLabel === item.label && (
              <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-1 bg-rhyze-black px-2 py-1 text-[10px] font-black text-white">
                {chartTooltip(item.label, item.value, 'money')}
              </span>
            )}
          </div>
        ))}
        {!sorted.length && (
          <p className="bg-rhyze-orange/10 p-5 text-sm font-bold text-rhyze-black/50">
            No revenue is recorded for this section yet.
          </p>
        )}
      </div>
    </section>
    </Link>
  );
}

export function CountBars({
  title,
  items,
  note,
  href = '/admin/members',
}: {
  title: string;
  items: Point[];
  note?: string;
  href?: string;
}) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const max = Math.max(...items.map((item) => item.value), 0);
  return (
    <Link href={href} className="block transition hover:-translate-y-0.5 hover:shadow-lg">
    <section className="border-t-4 border-rhyze-orange bg-white p-5">
      <p className="text-xs font-black uppercase tracking-widest text-rhyze-black/45">
        {title}
      </p>
      <div className="mt-5 grid gap-4">
        {items.map((item) => (
          <div
            key={item.label}
            tabIndex={0}
            className="relative outline-none focus:ring-2 focus:ring-rhyze-coral"
            onMouseEnter={() => setActiveLabel(item.label)}
            onMouseLeave={() => setActiveLabel(null)}
            onFocus={() => setActiveLabel(item.label)}
            onBlur={() => setActiveLabel(null)}
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-xs font-bold">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
            <div className="h-5 bg-rhyze-orange/10">
              <div
                className="h-full bg-rhyze-gradient"
                style={{ width: `${max ? Math.max((item.value / max) * 100, 2) : 0}%` }}
              />
            </div>
            {activeLabel === item.label && (
              <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-1 bg-rhyze-black px-2 py-1 text-[10px] font-black text-white">
                {chartTooltip(item.label, item.value, 'count')}
              </span>
            )}
          </div>
        ))}
      </div>
      {note && <p className="mt-4 text-xs font-bold text-rhyze-black/40">{note}</p>}
    </section>
    </Link>
  );
}
