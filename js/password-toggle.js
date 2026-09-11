/**
 * SMART JOB VACANCY FINDER - UNIVERSAL PASSWORD VISIBILITY TOGGLE (👁)
 * Standalone, zero-dependency password show/hide engine.
 */

window.togglePasswordVisibility = function(trigger, event) {
    if (event) {
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
    }

    if (!trigger) return;
    const btn = (trigger instanceof HTMLElement) 
        ? (trigger.closest('.toggle-password') || trigger) 
        : document.querySelector(`[data-target="${trigger}"]`);
    if (!btn) return;

    // Guard against duplicate execution in the same click event cycle
    const now = Date.now();
    if (btn._lastToggled && (now - btn._lastToggled < 300)) {
        return;
    }
    btn._lastToggled = now;

    const targetId = btn.getAttribute('data-target');
    let input = targetId ? document.getElementById(targetId) : null;
    if (!input) {
        const wrapper = btn.closest('.input-wrapper') || btn.parentElement;
        if (wrapper) {
            input = wrapper.querySelector('input');
        }
    }
    if (!input) return;

    const isPassword = (input.type === 'password' || input.getAttribute('type') === 'password');
    const newType = isPassword ? 'text' : 'password';

    // 1. Toggle input type
    input.setAttribute('type', newType);
    input.type = newType;

    // 2. Toggle button tooltip and accessibility label
    const newLabel = isPassword ? 'Hide Password' : 'Show Password';
    btn.setAttribute('title', newLabel);
    btn.setAttribute('aria-label', newLabel);

    // 3. Toggle eye icon
    const icon = btn.querySelector('i');
    if (icon) {
        if (isPassword) {
            icon.className = 'fa-solid fa-eye-slash';
        } else {
            icon.className = 'fa-solid fa-eye';
        }
    }

    // 4. Visual feedback on placeholder if field is empty
    if (!input.value) {
        if (isPassword) {
            if (!input.getAttribute('data-prev-ph')) {
                input.setAttribute('data-prev-ph', input.placeholder || '');
            }
            input.placeholder = 'Password (visible)';
        } else {
            input.placeholder = input.getAttribute('data-prev-ph') || '••••••••';
        }
    }

    // 5. Retain focus
    input.focus();
};

// Global click event listener fallback
document.addEventListener('click', function(e) {
    const btn = e.target.closest('.toggle-password');
    if (!btn) return;
    window.togglePasswordVisibility(btn, e);
});
