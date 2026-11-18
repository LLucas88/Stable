'use client';

import { RefreshCcwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  ErrorPanel,
  LoadingPanel,
  MetricCard,
  PageHeader,
} from '@/components/admin/page-elements';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  apiRequest,
  errorMessage,
  formatInteger,
  formatMoney,
} from '@/lib/admin-client';

type UsageRow = {
  request_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  usage_unknown_count: number;
  uncertain_micros: number;
  actual_micros: number;
};

type UsageData = {
  from: string;
  to: string;
  totals: UsageRow & {
    settled_count: number;
    released_count: number;
    uncertain_count: number;
    reconciled_count: number;
    confirmed_micros: number;
  };
  byAccount: Array<
    UsageRow & { account_id: string; username: string; display_name: string }
  >;
  byModel: Array<UsageRow & { model_id: string; display_name: string }>;
};

export default function UsagePage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState('');

  async function load(rangeDays = days) {
    const to = new Date();
    const from = new Date(to.getTime() - rangeDays * 86_400_000);
    try {
      const result = await apiRequest<UsageData>(
        `/api/admin/usage?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      );
      setError('');
      setData(result);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(days), 0);
    return () => window.clearTimeout(timer);
  }, [days]);

  return (
    <>
      <PageHeader
        eyebrow="Usage Ledger"
        title="用量统计"
        description="基于网关已记录请求汇总金额与 Token。待对账金额单独列示，不等同于已确认供应商成本。"
        action={
          <div className="flex gap-2">
            <NativeSelect
              value={String(days)}
              onChange={(event) => setDays(Number(event.target.value))}
              className="[&_select]:min-h-11"
              aria-label="统计周期"
            >
              <NativeSelectOption value="7">最近 7 天</NativeSelectOption>
              <NativeSelectOption value="30">最近 30 天</NativeSelectOption>
              <NativeSelectOption value="90">最近 90 天</NativeSelectOption>
            </NativeSelect>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => void load()}
            >
              <RefreshCcwIcon /> 刷新
            </Button>
          </div>
        }
      />

      {error ? (
        <ErrorPanel message={error} retry={() => void load()} />
      ) : !data ? (
        <LoadingPanel />
      ) : (
        <div className="space-y-6">
          <section
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
            aria-label="用量关键指标"
          >
            <MetricCard
              label="请求数"
              value={formatInteger(data.totals.request_count)}
              detail={`${formatInteger(data.totals.settled_count)} 已结算`}
            />
            <MetricCard
              label="确认成本"
              value={formatMoney(data.totals.confirmed_micros)}
              detail="已结算 + 已对账"
            />
            <MetricCard
              label="待对账预扣"
              value={formatMoney(data.totals.uncertain_micros)}
              detail={`${formatInteger(data.totals.uncertain_count)} 笔待处理`}
            />
            <MetricCard
              label="已知 Token"
              value={formatInteger(
                data.totals.prompt_tokens + data.totals.completion_tokens,
              )}
              detail="输入与输出合计"
            />
            <MetricCard
              label="用量未知请求"
              value={formatInteger(data.totals.usage_unknown_count)}
              detail="缺少完整 usage，不能按 0 处理"
            />
          </section>

          <UsageTable
            title="按账号"
            caption="账号维度汇总；账面金额包含待对账预扣。"
            rows={data.byAccount.map((row) => ({
              ...row,
              key: row.account_id,
              name: row.display_name,
              detail: `@${row.username}`,
            }))}
          />
          <UsageTable
            title="按模型"
            caption="模型维度汇总；历史请求按其冻结价格版本计入。"
            rows={data.byModel.map((row) => ({
              ...row,
              key: row.model_id,
              name: row.display_name,
              detail: row.model_id,
            }))}
          />
        </div>
      )}
    </>
  );
}

function UsageTable({
  title,
  caption,
  rows,
}: {
  title: string;
  caption: string;
  rows: Array<UsageRow & { key: string; name: string; detail: string }>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-4 py-4">
        <h2 className="font-semibold">{title}</h2>
      </div>
      <Table>
        <TableCaption>{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>维度</TableHead>
            <TableHead>请求</TableHead>
            <TableHead>输入 Token</TableHead>
            <TableHead>输出 Token</TableHead>
            <TableHead>待对账</TableHead>
            <TableHead>账面金额</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell>
                <p className="font-medium">{row.name}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {row.detail}
                </p>
              </TableCell>
              <TableCell>{formatInteger(row.request_count)}</TableCell>
              <TableCell>
                {formatInteger(row.prompt_tokens)}
                {row.usage_unknown_count > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    + {row.usage_unknown_count} 笔未知
                  </span>
                )}
              </TableCell>
              <TableCell>{formatInteger(row.completion_tokens)}</TableCell>
              <TableCell>{formatMoney(row.uncertain_micros)}</TableCell>
              <TableCell className="font-medium">
                {formatMoney(row.actual_micros)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
