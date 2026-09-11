/**
 * SMART JOB VACANCY FINDER - BULLETPROOF PASSWORD VISIBILITY TOGGLE (👁)
 */

window.togglePasswordVisibility = function(trigger, event) {
    // 1. Stop propagation immediately to prevent event bubbling conflicts
    var e = event || window.event;
    if (e) {
        if (e.stopPropagation) e.stopPropagation();
        if (e.preventDefault) e.preventDefault();
        e.cancelBubble = true;
    }

    if (!trigger) return;

    // 2. Identify the button element
    var btn = trigger;
    if (typeof trigger === 'string') {
        btn = document.querySelector('[data-target="' + trigger + '"]') || document.getElementById(trigger);
    } else if (trigger && trigger.nodeType) {
        btn = trigger.closest('.toggle-password') || trigger;
    }
    if (!btn) return;

    // 3. Strict 300ms debounce to prevent double-firing from bubbling or multiple listeners
    var now = Date.now();
    if (btn._lastToggled && (now - btn._lastToggled < 300)) {
        return;
    }
    btn._lastToggled = now;

    // 4. Locate the corresponding password input field
    var targetId = btn.getAttribute('data-target');
    var input = targetId ? document.getElementById(targetId) : null;
    if (!input) {
        var wrapper = btn.closest('.input-wrapper') || btn.parentElement;
        if (wrapper) {
            input = wrapper.querySelector('input');
        }
    }
    if (!input) return;

    // 5. Toggle password visibility
    var isPassword = (input.type === 'password' || input.getAttribute('type') === 'password');
    var newType = isPassword ? 'text' : 'password';

    input.type = newType;
    input.setAttribute('type', newType);

    // 6. Update button title and ARIA accessibility label
    var newLabel = isPassword ? 'Hide Password' : 'Show Password';
    btn.setAttribute('title', newLabel);
    btn.setAttribute('aria-label', newLabel);

    // 7. Toggle FontAwesome eye icon
    var icon = btn.querySelector('i');
    if (icon) {
        if (isPassword) {
            icon.className = 'fa-solid fa-eye-slash';
        } else {
            icon.className = 'fa-solid fa-eye';
        }
    }

    // 8. If empty, clarify placeholder
    if (!input.value) {
        if (isPassword) {
            if (!input.getAttribute('data-orig-ph')) {
                input.setAttribute('data-orig-ph', input.placeholder || '');
            }
            input.placeholder = 'Password visible';
        } else {
            input.placeholder = input.getAttribute('data-orig-ph') || '••••••••';
        }
    }

    input.focus();
};
