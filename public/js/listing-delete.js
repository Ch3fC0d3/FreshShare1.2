// public/js/listing-delete.js
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const confirmBtn = document.getElementById('deleteListingConfirmBtn');
    if (!confirmBtn) return;

    const modalEl = document.getElementById('deleteListingModal');
    const alertBox = document.getElementById('deleteListingAlert');
    let modalInstance = null;

    try {
      if (modalEl && window.bootstrap) {
        modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
      }
    } catch (_) {}

    function setLoading(isLoading){
      const label = confirmBtn.querySelector('.delete-label');
      const spinner = confirmBtn.querySelector('.delete-spinner');
      confirmBtn.disabled = !!isLoading;
      if (label) label.classList.toggle('d-none', !!isLoading);
      if (spinner) spinner.classList.toggle('d-none', !isLoading);
    }

    function showAlert(type, message){
      if (!alertBox) return;
      alertBox.className = `alert alert-${type}`;
      alertBox.textContent = message;
      alertBox.classList.remove('d-none');
    }

    async function handleDelete(){
      const listingId = confirmBtn.dataset.listingId;
      if (!listingId) return;

      setLoading(true);
      alertBox && alertBox.classList.add('d-none');

      const token = (function(){
        try {
          return localStorage.getItem('token') || localStorage.getItem('authToken');
        } catch (_) {
          return null;
        }
      })();

      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      try {
        const res = await fetch(`/api/marketplace/${listingId}`, {
          method: 'DELETE',
          headers
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 401) {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return;
        }

        if (!res.ok) {
          if (res.status === 403) {
            showAlert('danger', data && data.message ? data.message : 'You are not allowed to delete this listing.');
          } else if (res.status === 409) {
            const details = data && data.details;
            let message = data && data.message ? data.message : 'Cannot delete listing with active commitments.';
            if (details && typeof details === 'object') {
              const parts = [];
              if (details.groupBuy) {
                parts.push(`Group buy commitments: ${details.groupBuy.committedCases || 0} cases across ${details.groupBuy.participants || 0} participants.`);
              }
              if (details.pieceOrdering) {
                parts.push(`Per-piece reservations: Case #${details.pieceOrdering.currentCaseNumber || 1} with ${details.pieceOrdering.currentCaseRemaining ?? 'unknown'} pieces remaining.`);
              }
              if (parts.length) {
                message += ` ${parts.join(' ')}`;
              }
            }
            showAlert('warning', message);
          } else {
            showAlert('danger', data && data.message ? data.message : 'Failed to delete listing.');
          }
          return;
        }

        try { console.log('[ListingDelete] Listing deleted', listingId); } catch (_) {}
        if (modalInstance) {
          try { modalInstance.hide(); } catch (_) {}
        }
        window.location.href = '/dashboard?tab=listings';
      } catch (err) {
        showAlert('danger', 'Network error attempting to delete listing. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    confirmBtn.addEventListener('click', () => {
      handleDelete();
    });

    if (modalEl) {
      modalEl.addEventListener('hidden.bs.modal', () => {
        setLoading(false);
        if (alertBox) alertBox.classList.add('d-none');
      });
    }
  });
})();
