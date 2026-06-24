import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ConfirmDialog } from './ConfirmDialog'
import { ModalCloseButton } from './ModalCloseButton'
import { useInvoiceBankAccounts } from '../hooks/useInvoiceBankAccounts'
import type { InvoiceOptionsRole } from '../hooks/useInvoiceMemoOptions'
import { EMPTY_BANK_DETAILS, type InvoiceBankDetails } from '../types/invoiceBank'
import { formatBankAccountNo, sanitizeBankAccountNo } from '../utils/bankAccountNo'

export type InvoiceBankAccountFieldsLabels = {
  bankName: string
  bankNamePlaceholder: string
  bankAccountVariant: string
  bankAccountVariantPlaceholder: string
  beneficiary: string
  bankBranch: string
  accountNo: string
  accountNoDigitsOnly: string
  addNew: string
  addNewTitle: string
  addNewSave: string
  cancel: string
  loading: string
  noneSelected: string
  delete: string
  deleteConfirm: string
  deleteFailed: string
  saveSuccess?: string
}

type Props = {
  value: InvoiceBankDetails
  onChange: (next: InvoiceBankDetails) => void
  labels: InvoiceBankAccountFieldsLabels
  forRole?: InvoiceOptionsRole
}

function hasCompleteBankDetails(v: InvoiceBankDetails) {
  return Boolean(
    v.beneficiaryName.trim() &&
      v.bankName.trim() &&
      v.bankBranch.trim() &&
      v.accountNo.trim(),
  )
}

function accountToDetails(a: {
  beneficiaryName: string
  bankName: string
  bankBranch: string
  accountNo: string
}): InvoiceBankDetails {
  return {
    beneficiaryName: a.beneficiaryName,
    bankName: a.bankName,
    bankBranch: a.bankBranch,
    accountNo: a.accountNo,
  }
}

export function InvoiceBankAccountFields({ value, onChange, labels, forRole = 'finance' }: Props) {
  const { accounts, loading, addAccount, removeAccount } = useInvoiceBankAccounts(forRole)
  const [selectedBankName, setSelectedBankName] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState<InvoiceBankDetails>({ ...EMPTY_BANK_DETAILS })
  const [saveBusy, setSaveBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const bankNameOptions = useMemo(() => {
    const names = new Set(accounts.map((a) => a.bankName))
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [accounts])

  const accountsForBank = useMemo(
    () => accounts.filter((a) => a.bankName === selectedBankName),
    [accounts, selectedBankName],
  )

  useEffect(() => {
    if (!hasCompleteBankDetails(value)) {
      if (!value.bankName.trim()) {
        setSelectedBankName('')
        setSelectedAccountId('')
      } else {
        setSelectedBankName(value.bankName)
        setSelectedAccountId('')
      }
      return
    }
    setSelectedBankName(value.bankName)
    const match = accounts.find(
      (a) =>
        a.beneficiaryName === value.beneficiaryName &&
        a.bankName === value.bankName &&
        a.bankBranch === value.bankBranch &&
        a.accountNo === value.accountNo,
    )
    setSelectedAccountId(match?.id ?? '')
  }, [value, accounts])

  function openAddNew() {
    setDraft({ ...EMPTY_BANK_DETAILS, bankName: selectedBankName })
    setSaveError(null)
    setAddOpen(true)
  }

  function pickBank(bankName: string) {
    if (bankName === '__add_new__') {
      openAddNew()
      return
    }
    setSelectedBankName(bankName)
    const forBank = accounts.filter((a) => a.bankName === bankName)
    if (forBank.length === 1) {
      setSelectedAccountId(forBank[0].id)
      onChange(accountToDetails(forBank[0]))
      return
    }
    setSelectedAccountId('')
    onChange({ ...EMPTY_BANK_DETAILS, bankName })
  }

  function pickAccount(accountId: string) {
    setSelectedAccountId(accountId)
    const picked = accounts.find((a) => a.id === accountId)
    if (picked) onChange(accountToDetails(picked))
  }

  function requestDeleteAccount() {
    if (!selectedAccountId || deleteBusy) return
    setDeleteConfirmOpen(true)
  }

  async function deleteSelectedAccount() {
    if (!selectedAccountId || deleteBusy) return
    setDeleteConfirmOpen(false)
    setDeleteBusy(true)
    setSaveError(null)
    try {
      await removeAccount(selectedAccountId)
      setSelectedBankName('')
      setSelectedAccountId('')
      onChange({ ...EMPTY_BANK_DETAILS })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : labels.deleteFailed)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function saveNewAccount() {
    if (saveBusy) return
    const beneficiaryName = draft.beneficiaryName.trim()
    const bankName = draft.bankName.trim()
    const bankBranch = draft.bankBranch.trim()
    const accountNo = sanitizeBankAccountNo(draft.accountNo)
    if (!beneficiaryName || !bankName || !bankBranch || !accountNo) {
      setSaveError(labels.noneSelected)
      return
    }
    setSaveBusy(true)
    setSaveError(null)
    try {
      const saved = await addAccount({
        beneficiaryName,
        bankName,
        bankBranch,
        accountNo,
      })
      setSelectedBankName(saved.bankName)
      setSelectedAccountId(saved.id)
      onChange(accountToDetails(saved))
      setAddOpen(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaveBusy(false)
    }
  }

  const showDetails = selectedBankName !== '' && hasCompleteBankDetails(value)
  const needsAccountPick = selectedBankName !== '' && accountsForBank.length > 1 && !showDetails

  const addModal =
    addOpen &&
    createPortal(
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setAddOpen(false)
        }}
      >
        <div
          className="portal-modal w-full max-w-lg p-6"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <h3 className="portal-heading text-lg font-semibold">{labels.addNewTitle}</h3>
            <ModalCloseButton onClick={() => setAddOpen(false)} label={labels.cancel} />
          </div>
          <div className="grid gap-3">
            <label className="block space-y-1 text-sm">
              <span>{labels.bankName}</span>
              <input
                list="invoice-bank-name-suggestions"
                value={draft.bankName}
                onChange={(e) => setDraft((d) => ({ ...d, bankName: e.target.value }))}
                className="portal-input w-full"
              />
              <datalist id="invoice-bank-name-suggestions">
                {bankNameOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className="block space-y-1 text-sm">
              <span>{labels.bankBranch}</span>
              <input
                value={draft.bankBranch}
                onChange={(e) => setDraft((d) => ({ ...d, bankBranch: e.target.value }))}
                className="portal-input w-full"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>{labels.accountNo}</span>
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                value={formatBankAccountNo(draft.accountNo)}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, accountNo: sanitizeBankAccountNo(e.target.value) }))
                }
                title={labels.accountNoDigitsOnly}
                className="portal-input w-full"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>{labels.beneficiary}</span>
              <input
                value={draft.beneficiaryName}
                onChange={(e) => setDraft((d) => ({ ...d, beneficiaryName: e.target.value }))}
                className="portal-input w-full"
              />
            </label>
          </div>
          {saveError ? <p className="mt-3 text-sm text-red-600">{saveError}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className="portal-btn-secondary">
              {labels.cancel}
            </button>
            <button
              type="button"
              disabled={saveBusy}
              onClick={() => void saveNewAccount()}
              className="portal-btn-primary disabled:opacity-60"
            >
              {saveBusy ? labels.loading : labels.addNewSave}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      <input type="hidden" name="beneficiaryName" value={value.beneficiaryName} />
      <input type="hidden" name="bankName" value={value.bankName} />
      <input type="hidden" name="transferTo" value={value.bankName} />
      <input type="hidden" name="bankBranch" value={value.bankBranch} />
      <input type="hidden" name="accountNo" value={value.accountNo} />

      <div className="space-y-3 md:col-span-2">
        <label className="block space-y-1 text-sm">
          <span>{labels.bankName}</span>
          <select
            value={selectedBankName}
            disabled={loading}
            onChange={(e) => pickBank(e.target.value)}
            className="portal-select w-full disabled:opacity-60"
          >
            <option value="">{loading ? labels.loading : labels.bankNamePlaceholder}</option>
            {bankNameOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="__add_new__">{labels.addNew}</option>
          </select>
        </label>

        {needsAccountPick ? (
          <label className="block space-y-1 text-sm">
            <span>{labels.bankAccountVariant}</span>
            <select
              value={selectedAccountId}
              onChange={(e) => pickAccount(e.target.value)}
              className="portal-select w-full"
            >
              <option value="">{labels.bankAccountVariantPlaceholder}</option>
              {accountsForBank.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bankBranch} · {formatBankAccountNo(a.accountNo)} · {a.beneficiaryName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {selectedAccountId ? (
          <div className="flex flex-wrap justify-end">
            <button
              type="button"
              disabled={deleteBusy || loading}
              onClick={() => requestDeleteAccount()}
              className="portal-btn-secondary text-sm text-red-700 dark:text-red-300 disabled:opacity-50"
            >
              {deleteBusy ? labels.loading : labels.delete}
            </button>
          </div>
        ) : null}

        {showDetails ? (
          <div className="portal-card-sm rounded-lg border px-4 py-3 text-sm">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="portal-muted text-xs font-medium">{labels.bankBranch}</dt>
                <dd className="portal-heading">{value.bankBranch}</dd>
              </div>
              <div>
                <dt className="portal-muted text-xs font-medium">{labels.accountNo}</dt>
                <dd className="portal-heading font-mono">{formatBankAccountNo(value.accountNo)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="portal-muted text-xs font-medium">{labels.beneficiary}</dt>
                <dd className="portal-heading">{value.beneficiaryName}</dd>
              </div>
            </dl>
          </div>
        ) : selectedBankName ? (
          <p className="portal-muted text-xs">{labels.noneSelected}</p>
        ) : (
          <p className="portal-muted text-xs">{labels.noneSelected}</p>
        )}
        {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}
      </div>

      {addModal}

      <ConfirmDialog
        open={deleteConfirmOpen}
        message={labels.deleteConfirm}
        confirmLabel={labels.delete}
        cancelLabel={labels.cancel}
        busy={deleteBusy}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void deleteSelectedAccount()}
      />
    </>
  )
}
