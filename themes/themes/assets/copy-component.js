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
                this.displayEl = null;
            }

            createHTML() {
                this.innerHTML = `
                    <div class="copy-field-container">
                        <button 
                            type="button" 
                            class="copy-field-button button button--primary"
                        >
                            ${this.data.copyLabel || 'Copy Code'}
                        </button>
                        <div class="copy-field-display">${this.data.copyText || ''}</div>
                    </div>
                `;
                
                this.button = this.querySelector('.copy-field-button');
                this.displayEl = this.querySelector('.copy-field-display');
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
                if (!this.button) return;
                
                const originalText = this.button.textContent;
                this.button.textContent = message;
                this.button.disabled = true;
                
                setTimeout(() => {
                    if (this.button) {
                        this.button.textContent = originalText;
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