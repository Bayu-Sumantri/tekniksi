import Swal from 'sweetalert2';

const base = {
  buttonsStyling: true,
  confirmButtonColor: '#2563eb',
  cancelButtonColor: '#64748b',
  customClass: {
    popup: 'tekniksi-swal-popup',
    title: 'tekniksi-swal-title',
    htmlContainer: 'tekniksi-swal-content',
    confirmButton: 'tekniksi-swal-confirm',
    cancelButton: 'tekniksi-swal-cancel',
  },
};

export const alertSuccess = (title: string, text?: string) => Swal.fire({ ...base, icon: 'success', title, text, confirmButtonText: 'Mengerti' });
export const alertError = (title: string, text?: string) => Swal.fire({ ...base, icon: 'error', title, text, confirmButtonText: 'Mengerti' });
export const alertInfo = (title: string, text?: string) => Swal.fire({ ...base, icon: 'info', title, text, confirmButtonText: 'Mengerti' });
export const alertWarning = (title: string, text?: string) => Swal.fire({ ...base, icon: 'warning', title, text, confirmButtonText: 'Mengerti' });
export async function confirmAction(title: string, text: string, confirmButtonText = 'Ya, lanjutkan') {
  const result = await Swal.fire({ ...base, icon: 'question', title, text, showCancelButton: true, confirmButtonText, cancelButtonText: 'Batal', reverseButtons: true, focusCancel: true });
  return result.isConfirmed;
}
export function showLoading(title = 'Memproses permintaan...') {
  Swal.fire({ ...base, title, allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });
}
export const closeAlert = () => Swal.close();
