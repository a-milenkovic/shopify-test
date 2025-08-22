// Check if the custom element is already defined
if (!customElements.get('copy-component')) {
    customElements.define(
        'copy-component',
        class CopyComponent extends HTMLElement {
            constructor() {
                super();
                this.dataEl = this.querySelector('[data-section-data]');
                this.data = this.dataEl?.textContent
                    ? JSON.parse(this.dataEl.textContent)
                    : { copyText: '', copyLabel: 'Copy' };
                this.button = null;
                this.codeEl = null;
            }

            createHTML() {
                this.innerHTML = `
                    <div class="copy-field-container">
                        <div class="copy-field-label">${this.data.copyLabel || 'Code'}</div>
                        <button type="button" class="copy-field-button">
                            <span class="copy-field-code">${this.data.copyText || ''}</span>
                            <svg class="copy-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                            </svg>
                        </button>
                    </div>
                `;
                
                this.button = this.querySelector('.copy-field-button');
                this.codeEl = this.querySelector('.copy-field-code');
            }

            copyToClipboard() {
                if (!this.data.copyText || !this.button) return;

                // Try modern clipboard API first
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(this.data.copyText).then(() => {
                        this.showFeedback('Copied!');
                    }).catch(() => {
                        // Fallback if clipboard API fails
                        this.fallbackCopyToClipboard();
                    });
                } else {
                    // Fallback for older browsers
                    this.fallbackCopyToClipboard();
                }
            }

            fallbackCopyToClipboard() {
                const textArea = document.createElement('textarea');
                textArea.value = this.data.copyText;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                try {
                    document.execCommand('copy');
                    this.showFeedback('Copied!');
                } catch (err) {
                    this.showFeedback('Failed to copy');
                }
                
                document.body.removeChild(textArea);
            }

            showFeedback(message) {
                if (!this.codeEl) return;
                
                const originalText = this.codeEl.textContent;
                this.codeEl.textContent = message;
                this.button.disabled = true;
                
                setTimeout(() => {
                    if (this.codeEl) {
                        this.codeEl.textContent = originalText;
                        this.button.disabled = false;
                    }
                }, 2000);
            }

            bindEvents() {
                if (this.button) {
                    this.button.addEventListener('click', () => {
                        this.copyToClipboard();
                    });
                }
            }

            init() {
                this.createHTML();
                this.bindEvents();
            }

            // Lifecycle callback when the element is connected to the DOM
            connectedCallback() {
                this.init();
            }
        }
    );
}