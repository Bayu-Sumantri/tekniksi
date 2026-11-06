'use strict';
document.getElementById('printReport')?.addEventListener('click', () => window.print());
window.addEventListener('load', () => setTimeout(() => window.print(), 500));
