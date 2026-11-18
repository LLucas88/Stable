'use client';

import { BadgeDollarSignIcon, RefreshCcwIcon } from 'lucide-react';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

import {
  EmptyPanel,
  ErrorPanel,
  LoadingPanel,
  PageHeader,
} from '@/components/admin/page-elements';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  amountToMicros,
  apiRequest,
  errorMessage,
  formatDate,
  formatMoney,
  formString,
  microsToInput,
} from '@/lib/admin-client';

type PendingRequest = {
  id: string;
  accountId: string;
  username: string;
  accountDisplayName: string;
  modelId: string;
  modelDisplayName: string;
  reservedMicros: number;
  chargedMicros: number;
  currency: string;
  promptTokens: number | null;
  completionTokens: number | null;
  upstreamRequestId: string | null;
  failureCode: string | null;
  diagnostic?: {phase:string;networkCode:string|null;observedNode:string|null;at:number}|null;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
};

export default function ReconciliationPage() {
  const [requests, setRequests] = useState<PendingRequest[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PendingRequest | null>(null);

  async function load() {
    try {
      const result = await apiRequest<{ requests: PendingRequest[] }>(
        '/api/admin/reconciliation?limit=100',
      );
      setError('');
      setRequests(result.requests);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Exception Queue"
        title="待对账请求"
        description="上游是否接收、生成结果或用量尚未确认的请求，在核对前仍占用额度，但不代表最终消费。请依据供应商账单或日志核定，不要重新生成。"
        action={
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => void load()}
          >
            <RefreshCcwIcon /> 刷新
          </Button>
        }
      />

      {error ? (
        <ErrorPanel message={error} retry={() => void load()} />
      ) : requests === null ? (
        <LoadingPanel />
      ) : requests.length === 0 ? (
        <EmptyPanel
          title="没有待对账请求"
          description="当前异常队列为空。后续有不确定用量时会自动出现在这里。"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableCaption>
              按进入待对账状态的时间从早到晚排列，单次最多显示 100 笔。
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>请求</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>模型</TableHead>
                <TableHead>待核对额度</TableHead>
                <TableHead>异常原因</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-mono text-xs">
                    {request.id}
                  </TableCell>
                  <TableCell>
                    <p>{request.accountDisplayName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      @{request.username}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p>{request.modelDisplayName}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {request.modelId}
                    </p>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatMoney(request.chargedMicros, request.currency)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {request.failureCode ?? 'usage_unknown'}
                    {request.diagnostic&&<div className="mt-1 text-muted-foreground">阶段：{({prepare_request:'准备请求',dns:'域名解析',connect:'建立连接',tls:'TLS 校验',awaiting_response:'等待上游响应',read_response:'读取结果',validate_response:'校验结果',persist_result:'保存结果'} as Record<string,string>)[request.diagnostic.phase]||'未知'}{request.diagnostic.networkCode?' / '+request.diagnostic.networkCode:''}{request.diagnostic.observedNode?'；提交前观测线路：'+request.diagnostic.observedNode:''}</div>}
                  </TableCell>
                  <TableCell>{formatDate(request.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      className="min-h-9"
                      onClick={() => setSelected(request)}
                    >
                      <BadgeDollarSignIcon /> 对账
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ReconcileDialog
        request={selected}
        onClose={() => setSelected(null)}
        onCompleted={() => {
          setSelected(null);
          void load();
        }}
      />
    </>
  );
}

function ReconcileDialog({
  request,
  onClose,
  onCompleted,
}: {
  request: PendingRequest | null;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ adjustmentMicros: number } | null>(
    null,
  );
  const errorRef = useRef<HTMLDivElement>(null);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (!request) return;
    setPending(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const promptRaw = formString(data, 'promptTokens').trim();
    const completionRaw = formString(data, 'completionTokens').trim();
    try {
      if (Boolean(promptRaw) !== Boolean(completionRaw))
        throw new Error('输入与输出 Token 必须同时填写或同时留空。');
      const response = await apiRequest<{ adjustmentMicros: number }>(
        `/api/admin/reconciliation/${encodeURIComponent(request.id)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            actualMicros: amountToMicros(formString(data, 'actualAmount')),
            promptTokens: promptRaw ? Number(promptRaw) : undefined,
            completionTokens: completionRaw ? Number(completionRaw) : undefined,
            note: formString(data, 'note'),
          }),
        },
      );
      setResult(response);
    } catch (submitError) {
      setError(errorMessage(submitError));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  function close() {
    if (pending) return;
    setError('');
    setResult(null);
    if (result) onCompleted();
    else onClose();
  }

  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{result ? '对账已完成' : '核定真实用量'}</DialogTitle>
          <DialogDescription>
            {result
              ? '系统已原子更新请求状态、旧额度桶和对账审计。'
              : `当前预扣 ${formatMoney(request?.chargedMicros ?? 0, request?.currency)}。实际金额可以为 0，也可以高于预扣。`}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">账面调整</p>
            <p className="mt-2 text-xl font-semibold">
              {result.adjustmentMicros >= 0 ? '+' : ''}
              {formatMoney(result.adjustmentMicros, request?.currency)}
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive outline-none"
              >
                {error}
              </div>
            )}
            <form
              id="reconcile-form"
              onSubmit={submit}
              className="grid gap-4 sm:grid-cols-2"
            >
              <Field
                id="actual-amount"
                label={`实际金额（${request?.currency ?? 'CNY'}）`}
                className="sm:col-span-2"
              >
                <Input
                  key={request?.id}
                  id="actual-amount"
                  name="actualAmount"
                  inputMode="decimal"
                  defaultValue={microsToInput(request?.chargedMicros ?? 0)}
                  className="min-h-11"
                  required
                />
              </Field>
              <Field id="prompt-tokens" label="输入 Token（可选）">
                <Input
                  id="prompt-tokens"
                  name="promptTokens"
                  type="number"
                  min={0}
                  className="min-h-11"
                />
              </Field>
              <Field id="completion-tokens" label="输出 Token（可选）">
                <Input
                  id="completion-tokens"
                  name="completionTokens"
                  type="number"
                  min={0}
                  className="min-h-11"
                />
              </Field>
              <Field
                id="reconcile-note"
                label="核对依据"
                className="sm:col-span-2"
              >
                <Textarea
                  id="reconcile-note"
                  name="note"
                  maxLength={500}
                  className="min-h-24"
                  placeholder="例如：依据供应商 8 月 31 日账单核对"
                  required
                />
              </Field>
            </form>
          </>
        )}
        <DialogFooter>
          {result ? (
            <Button className="min-h-11" onClick={close}>
              完成
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={onClose}
                disabled={pending}
              >
                取消
              </Button>
              <Button
                form="reconcile-form"
                type="submit"
                className="min-h-11"
                disabled={pending}
              >
                {pending ? '正在对账…' : '确认对账'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  className = '',
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
