'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import { showApiError } from '@/components/api-error-toast';
import { TableSkeleton } from '@/components/skeleton';
import { formatPrice, formatDate } from '@/lib/format';
import { PageHeader, DataTable, Badge, Pagination, Button, Alert, type Column } from '@/components/ui';
import { Map } from 'lucide-react';
import type { Parcel, PaginatedResponse } from '@/types';

const statusLabels: Record<string, string> = {
  draft: 'Taslak',
  active: 'Aktif',
  deposit_taken: 'Depozito Alındı',
  sold: 'Satıldı',
  withdrawn: 'Geri Çekildi',
  reserved: 'Ayırtıldı',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  sold: 'bg-red-100 text-red-700',
  deposit_taken: 'bg-yellow-100 text-yellow-700',
  reserved: 'bg-purple-100 text-purple-700',
  withdrawn: 'bg-gray-100 text-gray-400',
  draft: 'bg-gray-100 text-gray-500',
};

const SESSION_KEY = 'admin_parcels_state';

function restoreState() {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) return JSON.parse(saved) as { page: number; status: string; search: string };
  } catch {}
  return null;
}

export default function AdminParcelsPage() {
  const saved = restoreState();
  const [data, setData] = useState<PaginatedResponse<Parcel> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(saved?.page ?? 1);
  const [statusFilter, setStatusFilter] = useState(saved?.status ?? '');
  const [searchInput, setSearchInput] = useState(saved?.search ?? '');
  const [search, setSearch] = useState(saved?.search ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkPrice, setShowBulkPrice] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  const fetchParcels = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const { data: res } = await apiClient.get<PaginatedResponse<Parcel>>('/parcels', { params });
      setData(res);
    } catch (err) {
      showApiError(err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchParcels();
  }, [fetchParcels]);

  // Persist list state so "back" from edit page restores position
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ page, status: statusFilter, search }));
    } catch {}
  }, [page, statusFilter, search]);

  useEffect(() => {
    if (editRef.current) editRef.current.focus();
  }, [editingCell]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!data) return;
    if (selectedIds.size === data.data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.data.map((p) => p.id)));
    }
  }

  function startEdit(parcel: Parcel, field: string) {
    setEditingCell({ id: parcel.id, field });
    if (field === 'price') setEditValue(parcel.price || '');
    else if (field === 'status') setEditValue(parcel.status);
    else if (field === 'title') setEditValue(parcel.title);
    else if (field === 'ada') setEditValue(parcel.ada || '');
    else if (field === 'parsel') setEditValue(parcel.parsel || '');
  }

  async function saveEdit() {
    if (!editingCell) return;
    try {
      await apiClient.patch(`/parcels/${editingCell.id}`, {
        [editingCell.field]: editingCell.field === 'price' ? parseFloat(editValue) : editValue,
      });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.map((p) =>
            p.id === editingCell.id ? { ...p, [editingCell.field]: editValue } : p,
          ),
        };
      });
      setEditingCell(null);
    } catch (err) {
      showApiError(err);
    }
  }

  function cancelEdit() {
    setEditingCell(null);
    setEditValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') cancelEdit();
  }

  async function handleExport(format: 'xlsx' | 'csv') {
    try {
      const { data: blob } = await apiClient.get('/admin/parcels/export', {
        params: { format },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `arsalar-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showApiError(err);
    }
  }

  const columns: Column<Parcel>[] = [
    {
      header: '',
      className: 'w-10',
      accessor: (p) => (
        <input
          type="checkbox"
          checked={selectedIds.has(p.id)}
          onChange={() => toggleSelect(p.id)}
          className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
        />
      ),
    },
    {
      header: 'İlan',
      accessor: (p) => (
        <div className="flex items-center gap-3">
          {p.images && p.images.length > 0 ? (
            <img
              src={typeof p.images[0] === 'string' ? p.images[0] : (p.images[0].thumbnailUrl || p.images[0].watermarkedUrl || p.images[0].originalUrl || p.images[0].url)}
              alt=""
              className="h-10 w-14 rounded object-cover shrink-0 bg-gray-100"
            />
          ) : (
            <div className="h-10 w-14 rounded bg-gray-100 flex items-center justify-center shrink-0">
              <Map className="h-4 w-4 text-gray-400" />
            </div>
          )}
          <div className="min-w-0">
            {editingCell?.id === p.id && editingCell.field === 'title' ? (
              <input
                ref={editRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={saveEdit}
                className="w-full rounded border border-brand-500 px-2 py-1 text-sm focus:outline-none"
              />
            ) : (
              <span
                className="font-medium cursor-pointer hover:text-brand-500 line-clamp-2 text-sm"
                onDoubleClick={() => startEdit(p, 'title')}
                title={p.title}
              >
                {p.title}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Şehir',
      accessor: (p) => (
        <span className="text-[var(--muted-foreground)]">
          {p.city}, {p.district}
        </span>
      ),
    },
    {
      header: 'Fiyat',
      accessor: (p) =>
        editingCell?.id === p.id && editingCell.field === 'price' ? (
          <input
            ref={editRef}
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveEdit}
            className="w-28 rounded border border-brand-500 px-2 py-1 text-sm font-mono focus:outline-none"
          />
        ) : (
          <span
            className="font-mono cursor-pointer hover:text-brand-500"
            onDoubleClick={() => startEdit(p, 'price')}
            title="Düzenlemek için çift tıklayın"
          >
            {formatPrice(p.price)}
          </span>
        ),
    },
    {
      header: 'Alan',
      accessor: (p) => (
        <span className="text-sm text-[var(--muted-foreground)]">
          {p.areaM2 ? `${Number(p.areaM2).toLocaleString('tr-TR')} m²` : '—'}
        </span>
      ),
    },
    {
      header: 'Ada',
      className: 'w-20',
      accessor: (p) =>
        editingCell?.id === p.id && editingCell.field === 'ada' ? (
          <input
            ref={editRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveEdit}
            className="w-16 rounded border border-brand-500 px-2 py-1 text-sm focus:outline-none"
          />
        ) : (
          <span
            className="cursor-pointer hover:text-brand-500 text-sm"
            onDoubleClick={() => startEdit(p, 'ada')}
            title="Düzenlemek için çift tıklayın"
          >
            {p.ada || '—'}
          </span>
        ),
    },
    {
      header: 'Parsel',
      className: 'w-20',
      accessor: (p) =>
        editingCell?.id === p.id && editingCell.field === 'parsel' ? (
          <input
            ref={editRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={saveEdit}
            className="w-16 rounded border border-brand-500 px-2 py-1 text-sm focus:outline-none"
          />
        ) : (
          <span
            className="cursor-pointer hover:text-brand-500 text-sm"
            onDoubleClick={() => startEdit(p, 'parsel')}
            title="Düzenlemek için çift tıklayın"
          >
            {p.parsel || '—'}
          </span>
        ),
    },
    {
      header: 'Durum',
      accessor: (p) =>
        editingCell?.id === p.id && editingCell.field === 'status' ? (
          <select
            value={editValue}
            onChange={(e) => {
              const newStatus = e.target.value;
              setEditValue(newStatus);
              apiClient
                .patch(`/parcels/${p.id}/status`, { status: newStatus })
                .then(() => {
                  setData((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      data: prev.data.map((parcel) =>
                        parcel.id === p.id ? { ...parcel, status: newStatus } : parcel,
                      ),
                    };
                  });
                  setEditingCell(null);
                })
                .catch(showApiError);
            }}
            onBlur={cancelEdit}
            autoFocus
            className="rounded border border-brand-500 px-2 py-1 text-xs focus:outline-none"
          >
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={`cursor-pointer inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[p.status] || 'bg-gray-100 text-gray-700'}`}
            onClick={() => startEdit(p, 'status')}
            title="Durumu değiştirmek için tıklayın"
          >
            {statusLabels[p.status] || p.status}
          </span>
        ),
    },
    {
      header: 'Tarih',
      accessor: (p) => (
        <span className="text-xs text-[var(--muted-foreground)]">
          {formatDate(p.createdAt, 'date')}
        </span>
      ),
    },
    {
      header: '',
      accessor: (p) => (
        <Link href={`/admin/parcels/${p.id}`} className="text-brand-500 hover:underline text-xs">
          Düzenle
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Arsalar"
        subtitle={data ? `${data.meta.total} arsa` : undefined}
        action={
          <Link
            href="/admin/parcels/new"
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
          >
            Yeni Arsa
          </Link>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
            setPage(1);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="Ara... (başlık, şehir)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm w-56"
          />
          <Button type="submit" size="sm">
            Ara
          </Button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
        >
          <option value="">Tüm Durumlar</option>
          {Object.entries(statusLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        {selectedIds.size > 0 && (
          <div className="flex gap-2 items-center" data-tour="admin-parcels-bulk">
            <span className="text-sm text-[var(--muted-foreground)]">{selectedIds.size} seçili</span>
            <Button size="sm" variant="secondary" onClick={() => setShowBulkPrice(true)}>
              Toplu Fiyat Güncelle
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative group" data-tour="admin-parcels-export">
            <Button size="sm" variant="secondary">
              Dışa Aktar ▾
            </Button>
            <div className="absolute right-0 top-full z-10 mt-1 hidden w-36 rounded-md border border-[var(--border)] bg-[var(--background)] shadow-lg group-hover:block">
              <button
                onClick={() => handleExport('xlsx')}
                className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--muted)]"
              >
                Excel (.xlsx)
              </button>
              <button
                onClick={() => handleExport('csv')}
                className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--muted)]"
              >
                CSV (.csv)
              </button>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowImport(true)}
            data-tour="admin-parcels-import"
          >
            İçe Aktar
          </Button>
        </div>
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">
        Başlık, fiyat veya duruma çift tıklayarak satır içi düzenleme yapabilirsiniz.
      </p>

      {loading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : (
        data && (
          <>
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <input
                type="checkbox"
                checked={data.data.length > 0 && selectedIds.size === data.data.length}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-gray-300 text-brand-500"
              />
              <span>Tümünü Seç</span>
            </div>
            <DataTable columns={columns} data={data.data} keyExtractor={(p) => p.id} />
            <Pagination page={page} totalPages={data.meta.totalPages} onPageChange={setPage} />
          </>
        )
      )}

      {showBulkPrice && (
        <BulkPriceModal
          selectedIds={[...selectedIds]}
          onClose={() => setShowBulkPrice(false)}
          onSuccess={() => {
            setShowBulkPrice(false);
            setSelectedIds(new Set());
            fetchParcels();
          }}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false);
            fetchParcels();
          }}
        />
      )}
    </div>
  );
}

/* ═══ Bulk Price Update Modal ═══ */
function BulkPriceModal({
  selectedIds,
  onClose,
  onSuccess,
}: {
  selectedIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [percentage, setPercentage] = useState('');
  const [roundTo, setRoundTo] = useState('1000');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!percentage) return;
    setSaving(true);
    try {
      await apiClient.post('/admin/parcels/bulk-price-update', {
        parcelIds: selectedIds,
        percentageIncrease: parseFloat(percentage),
        roundUpTo: parseInt(roundTo, 10),
      });
      setResult(`${selectedIds.length} arsa fiyatı güncellendi.`);
      setTimeout(onSuccess, 1500);
    } catch (err) {
      showApiError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Toplu Fiyat Güncelleme</h3>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {selectedIds.length} arsa için fiyat güncellemesi yapın.
        </p>

        {result ? (
          <Alert variant="success" className="mt-4">
            {result}
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Yüzde Değişim (%)</label>
              <input
                type="number"
                step="0.1"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                placeholder="Örn: 10 (artış) veya -5 (indirim)"
                className="mt-1 w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
                required
              />
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Pozitif değer fiyat artışı, negatif değer indirim uygular.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Yuvarlama (TL)</label>
              <select
                value={roundTo}
                onChange={(e) => setRoundTo(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                <option value="1">1 TL</option>
                <option value="100">100 TL</option>
                <option value="1000">1.000 TL</option>
                <option value="5000">5.000 TL</option>
                <option value="10000">10.000 TL</option>
              </select>
            </div>
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Güncelleniyor...' : 'Güncelle'}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                İptal
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ═══ Import Modal ═══ */
function ImportModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await apiClient.post('/admin/parcels/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      if (!data.errors || data.errors.length === 0) {
        setTimeout(onSuccess, 1500);
      }
    } catch (err) {
      showApiError(err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Excel / CSV İçe Aktar</h3>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Excel (.xlsx) veya CSV dosyasından arsa verilerini içe aktarın.
        </p>

        {result ? (
          <div className="mt-4 space-y-3">
            <Alert variant="success">{result.success} arsa başarıyla içe aktarıldı.</Alert>
            {result.errors && result.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium text-red-600">
                  Hatalar ({result.errors.length}):
                </p>
                <ul className="mt-1 max-h-40 overflow-y-auto space-y-1">
                  {result.errors.map((err, i) => (
                    <li key={i} className="text-xs text-red-500">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button onClick={onClose}>Kapat</Button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const dropped = e.dataTransfer.files[0];
                if (dropped) setFile(dropped);
              }}
              className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragOver
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-[var(--border)] hover:border-brand-300'
              }`}
            >
              {file ? (
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <button
                    onClick={() => setFile(null)}
                    className="mt-2 text-xs text-red-500 hover:underline"
                  >
                    Değiştir
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Dosyayı sürükleyin veya{' '}
                    <label className="cursor-pointer text-brand-500 hover:underline">
                      seçin
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Desteklenen formatlar: .xlsx, .xls, .csv
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button onClick={handleUpload} disabled={!file || uploading}>
                {uploading ? 'Yükleniyor...' : 'İçe Aktar'}
              </Button>
              <Button variant="secondary" onClick={onClose}>
                İptal
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
