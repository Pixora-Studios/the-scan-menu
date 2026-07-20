import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { managerService, Table } from '../services/restaurant.service';
import { Plus, Edit2, Trash2, RefreshCw, QrCode, Download, X, Loader, HelpCircle } from 'lucide-react';

const tableSchema = z.object({
  tableNumber: z.string().min(1, 'Table number is required'),
  displayName: z.string().min(1, 'Display name is required'),
});

type TableFormValues = z.infer<typeof tableSchema>;

export const ManagerTables: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsCreateOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [showQrModal, setShowQrModal] = useState<Table | null>(null);
  const [confirmRegenTable, setConfirmRegenTable] = useState<Table | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active restaurant ID for this manager (from useAuth list)
  const activeRestaurantId = user?.restaurants?.[0];

  // Fetch tables list
  const { data: tablesData, isLoading } = useQuery({
    queryKey: ['managerTables', activeRestaurantId],
    queryFn: () => managerService.listTables(activeRestaurantId!),
    enabled: !!activeRestaurantId,
  });

  const tables: Table[] = tablesData?.data || [];

  // Fetch QR info when QR modal is opened
  const { data: qrData, isLoading: isLoadingQr } = useQuery({
    queryKey: ['tableQr', activeRestaurantId, showQrModal?._id],
    queryFn: () => managerService.getTableQr(activeRestaurantId!, showQrModal!._id),
    enabled: !!activeRestaurantId && !!showQrModal?._id,
  });

  // Create table
  const createMutation = useMutation({
    mutationFn: (data: TableFormValues) => managerService.createTable(activeRestaurantId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managerTables', activeRestaurantId] });
      setIsCreateOpen(false);
      tableForm.reset();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error?.message || 'Error creating table');
    },
  });

  // Edit table
  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Table> }) =>
      managerService.editTable(activeRestaurantId!, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managerTables', activeRestaurantId] });
      setIsCreateOpen(false);
      setEditingTable(null);
      tableForm.reset();
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.error?.message || 'Error editing table');
    },
  });

  // Delete table
  const deleteMutation = useMutation({
    mutationFn: (id: string) => managerService.deleteTable(activeRestaurantId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managerTables', activeRestaurantId] });
    },
  });

  // Regenerate table QR
  const regenerateMutation = useMutation({
    mutationFn: (id: string) => managerService.regenerateTableQr(activeRestaurantId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managerTables', activeRestaurantId] });
      setConfirmRegenTable(null);
      alert('QR code rotated and successfully updated.');
    },
  });

  const tableForm = useForm<TableFormValues>({
    resolver: zodResolver(tableSchema),
  });

  const onSubmit = (values: TableFormValues) => {
    setErrorMsg(null);
    if (editingTable) {
      editMutation.mutate({ id: editingTable._id, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleEditClick = (table: Table) => {
    setEditingTable(table);
    tableForm.reset({
      tableNumber: table.tableNumber,
      displayName: table.displayName,
    });
    setIsCreateOpen(true);
  };

  const handleDownloadPng = () => {
    if (qrData?.data?.pngDataUri && showQrModal) {
      const link = document.createElement('a');
      link.href = qrData.data.pngDataUri;
      link.download = `qr-table-${showQrModal.tableNumber}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (!activeRestaurantId) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <Loader className="w-12 h-12 text-amber-500 mb-4 animate-pulse" />
        <h2 className="font-display text-2xl font-bold text-slate-800">No Restaurant Assigned</h2>
        <p className="text-slate-500 text-sm max-w-sm mt-1">
          You are currently not associated as a manager with any restaurant. Please contact a Super Admin to get assigned.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="font-display tracking-tight text-4xl font-bold text-slate-900">
            Restaurant Tables
          </h1>
          <p className="text-slate-500 text-sm">Create tables and manage secure physical QR placements</p>
        </div>
        <button
          onClick={() => {
            setEditingTable(null);
            tableForm.reset({ tableNumber: '', displayName: '' });
            setIsCreateOpen(true);
          }}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-800 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Add Table</span>
        </button>
      </div>

      {/* Grid list of Tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tables.map((table) => (
          <div
            key={table._id}
            className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold text-lg text-slate-900">{table.displayName}</h3>
                  <p className="text-xs text-slate-400">Table Number: {table.tableNumber}</p>
                </div>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    table.isActive
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {table.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mb-4 break-all">Token: {table.token}</p>
            </div>

            <div className="border-t border-slate-50 pt-4 mt-auto flex items-center justify-between gap-2">
              <button
                onClick={() => handleEditClick(table)}
                className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-primary hover:underline transition animate-none"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>

              <button
                onClick={() => setShowQrModal(table)}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>View QR</span>
              </button>

              <button
                onClick={() => setConfirmRegenTable(table)}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2 py-1 rounded-lg transition"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Rotate</span>
              </button>

              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete this table?')) {
                    deleteMutation.mutate(table._id);
                  }
                }}
                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Table Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-2xl font-bold">
                {editingTable ? 'Edit Table' : 'New Table'}
              </h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                {errorMsg}
              </div>
            )}

            <form onSubmit={tableForm.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Table Number
                </label>
                <input
                  type="text"
                  placeholder="12"
                  {...tableForm.register('tableNumber')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                />
                {tableForm.formState.errors.tableNumber && (
                  <p className="text-xs text-red-500 mt-1">
                    {tableForm.formState.errors.tableNumber.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  placeholder="Table 12 (Main Room)"
                  {...tableForm.register('displayName')}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                />
                {tableForm.formState.errors.displayName && (
                  <p className="text-xs text-red-500 mt-1">
                    {tableForm.formState.errors.displayName.message}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="w-1/2 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition"
                >
                  {editingTable ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Preview Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-100 flex flex-col items-center">
            <div className="flex justify-between items-center w-full mb-4">
              <h3 className="font-display text-xl font-bold">{showQrModal.displayName} QR</h3>
              <button
                onClick={() => setShowQrModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingQr ? (
              <div className="h-48 flex items-center justify-center">
                <Loader className="w-8 h-8 animate-spin text-amber-500" />
              </div>
            ) : qrData?.data?.svg ? (
              <div className="space-y-6 flex flex-col items-center w-full">
                {/* SVG QR Code rendering */}
                <div
                  className="w-48 h-48 border border-slate-100 p-2 rounded-2xl flex items-center justify-center shadow-inner"
                  dangerouslySetInnerHTML={{ __html: qrData.data.svg }}
                />

                <p className="text-slate-500 text-xs text-center break-all font-mono select-all bg-slate-50 p-2 rounded-xl border border-slate-100 w-full max-w-xs">
                  {qrData.data.url}
                </p>

                <button
                  onClick={handleDownloadPng}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PNG</span>
                </button>
              </div>
            ) : (
              <p className="text-sm text-red-500">Failed to load QR details.</p>
            )}
          </div>
        </div>
      )}

      {/* Confirmation of rotation Modal */}
      {confirmRegenTable && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-100">
            <div className="flex items-center gap-2 text-red-600 mb-4">
              <HelpCircle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-lg">Regenerate QR Code?</h3>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              This will invalidate the current QR code — reprint required. Continue?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmRegenTable(null)}
                className="w-1/2 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition"
              >
                No, Keep it
              </button>
              <button
                type="button"
                onClick={() => regenerateMutation.mutate(confirmRegenTable._id)}
                className="w-1/2 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition"
              >
                Yes, Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ManagerTables;
