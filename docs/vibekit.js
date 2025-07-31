/**
 * VibeKit Modal with Iframe
 * A pure JavaScript modal component that displays content in an iframe
 */
class VibeKitModal {
    // Constants
    static DEFAULTS = {
        width: 900,
        height: 620,
        minHeight: 200,
        maxHeightRatio: 0.95,
        maxWidthRatio: 0.95,
        animationDuration: 300,
        retryInterval: 100,
        maxRetryAttempts: 10
    };

    static SELECTORS = {
        overlay: 'vibekit-modal-overlay',
        modal: 'vibekit-modal',
        close: 'vibekit-modal-close',
        body: 'vibekit-modal-body',
        iframe: 'vibekit-modal-iframe',
        loading: 'vibekit-modal-loading',
        loader: 'vibekit-loader',
        styles: 'vibekit-modal-styles',
        button: 'vibekit-button'
    };

    static MESSAGES = {
        COPY: 'VIBEKIT_COPY',
        RESIZE: 'VIBEKIT_RESIZE'
    };

    constructor() {
        this.modal = null;
        this.iframe = null;
        this.isOpen = false;
        this.handleMessage = this.handleMessage.bind(this);
        this.init();
    }

    init() {
        this.createStyles();
        this.createModal();
        this.bindEvents();
    }

    createStyles() {
        if (document.getElementById(VibeKitModal.SELECTORS.styles)) return;

        const style = document.createElement('style');
        style.id = VibeKitModal.SELECTORS.styles;
        style.textContent = this.getModalStyles();
        document.head.appendChild(style);
    }

    getModalStyles() {
        const { width, height, animationDuration } = VibeKitModal.DEFAULTS;
        return `
            .${VibeKitModal.SELECTORS.overlay} {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                z-index: 10000;
                display: flex;
                justify-content: center;
                align-items: center;
                opacity: 0;
                visibility: hidden;
                transition: all ${animationDuration}ms ease;
            }

            .${VibeKitModal.SELECTORS.overlay}.active {
                opacity: 1;
                visibility: visible;
            }

            .${VibeKitModal.SELECTORS.modal} {
                background: white;
                border-radius: 8px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                max-width: ${VibeKitModal.DEFAULTS.maxWidthRatio * 100}vw;
                max-height: ${VibeKitModal.DEFAULTS.maxHeightRatio * 100}vh;
                width: ${width}px;
                height: ${height}px;
                min-height: ${VibeKitModal.DEFAULTS.minHeight}px;
                position: relative;
                transform: scale(0.7);
                transition: transform ${animationDuration}ms ease, height ${animationDuration}ms ease;
                overflow: hidden;
            }

            .${VibeKitModal.SELECTORS.overlay}.active .${VibeKitModal.SELECTORS.modal} {
                transform: scale(1);
            }

            .${VibeKitModal.SELECTORS.close} {
                position: absolute;
                top: 10px;
                right: 10px;
                background: none;
                border: none;
                cursor: pointer;
                color: #6b7280;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 6px;
                transition: all 0.2s ease;
                z-index: 1;
            }

            .${VibeKitModal.SELECTORS.close}:hover {
                background-color: #f3f4f6;
                color: #374151;
            }

            .${VibeKitModal.SELECTORS.body} {
                height: 100%;
                position: relative;
            }

            .${VibeKitModal.SELECTORS.iframe} {
                width: 100%;
                height: ${height}px;
                border: none;
                display: block;
            }

            .${VibeKitModal.SELECTORS.loading} {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #6b7280;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .${VibeKitModal.SELECTORS.loader} {
                animation: vibekit-spin 1s linear infinite;
            }

            @keyframes vibekit-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
    }

    createModal() {
        // Create modal structure
        this.overlay = this.createElement('div', VibeKitModal.SELECTORS.overlay);
        this.modal = this.createElement('div', VibeKitModal.SELECTORS.modal);
        
        // Create components
        const closeButton = this.createCloseButton();
        const body = this.createModalBody();
        
        // Assemble and append
        this.modal.appendChild(closeButton);
        this.modal.appendChild(body);
        this.overlay.appendChild(this.modal);
        document.body.appendChild(this.overlay);
        
        // Store references
        this.closeButton = closeButton;
    }

    createElement(tag, className) {
        const element = document.createElement(tag);
        element.className = className;
        return element;
    }

    createCloseButton() {
        const button = this.createElement('button', VibeKitModal.SELECTORS.close);
        button.innerHTML = this.getSVGIcon('close');
        button.setAttribute('aria-label', 'Close modal');
        return button;
    }

    createModalBody() {
        const body = this.createElement('div', VibeKitModal.SELECTORS.body);
        
        // Create loading indicator
        this.loading = this.createElement('div', VibeKitModal.SELECTORS.loading);
        this.loading.innerHTML = this.getSVGIcon('loading');
        
        // Create iframe
        this.iframe = this.createElement('iframe', VibeKitModal.SELECTORS.iframe);
        this.iframe.style.display = 'none';
        
        body.appendChild(this.loading);
        body.appendChild(this.iframe);
        
        return body;
    }

    getSVGIcon(type) {
        const icons = {
            close: `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m18 6-12 12"></path>
                    <path d="m6 6 12 12"></path>
                </svg>
            `,
            loading: `
                <svg class="${VibeKitModal.SELECTORS.loader}" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                </svg>
            `
        };
        return icons[type] || '';
    }

    bindEvents() {
        // Modal events
        this.closeButton.addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        // Global events
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) this.close();
        });

        // Iframe events
        this.iframe.addEventListener('load', () => this.handleIframeLoad());
        this.iframe.addEventListener('error', () => this.handleIframeError());
        
        // Message handling
        window.addEventListener('message', this.handleMessage);
    }

    handleIframeLoad() {
        this.loading.style.display = 'none';
        this.iframe.style.display = 'block';
    }

    handleIframeError() {
        this.loading.textContent = 'Failed to load content';
    }

    handleMessage(event) {
        // Security check
        if (this.iframe && event.source !== this.iframe.contentWindow) return;
        if (!event.data || !event.data.type) return;

        switch (event.data.type) {
            case VibeKitModal.MESSAGES.COPY:
                this.copyToClipboard(event.data.content);
                break;
            case VibeKitModal.MESSAGES.RESIZE:
                this.adjustHeight(event.data.height);
                break;
        }
    }

    async copyToClipboard(content) {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(content);
            } else {
                this.fallbackCopyToClipboard(content);
            }
        } catch (error) {
            // Silently fail in production
        }
    }

    fallbackCopyToClipboard(content) {
        const textArea = document.createElement('textarea');
        Object.assign(textArea.style, {
            value: content,
            position: 'fixed',
            opacity: '0',
            pointerEvents: 'none'
        });
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }

    adjustHeight(contentHeight) {
        const { minHeight, maxHeightRatio } = VibeKitModal.DEFAULTS;
        const maxHeight = window.innerHeight * maxHeightRatio;
        const newHeight = Math.max(minHeight, Math.min(maxHeight, contentHeight));
        
        this.iframe.style.height = `${newHeight}px`;
        this.modal.style.height = `${newHeight}px`;
    }

    open(url, title = 'Modal') {
        if (this.isOpen) return;

        this.prepareIframe(url);
        this.showModal();
        this.closeButton.focus();
    }

    prepareIframe(url) {
        this.loading.style.display = 'block';
        this.iframe.style.display = 'none';
        this.iframe.src = url;
    }

    showModal() {
        document.body.style.overflow = 'hidden';
        this.overlay.classList.add('active');
        this.isOpen = true;
    }

    close() {
        if (!this.isOpen) return;

        document.body.style.overflow = '';
        this.overlay.classList.remove('active');
        this.isOpen = false;

        // Clear iframe src after animation
        setTimeout(() => {
            if (!this.isOpen) this.iframe.src = 'about:blank';
        }, VibeKitModal.DEFAULTS.animationDuration);
    }

    destroy() {
        if (this.handleMessage) {
            window.removeEventListener('message', this.handleMessage);
        }
        
        this.overlay?.parentNode?.removeChild(this.overlay);
        
        const styles = document.getElementById(VibeKitModal.SELECTORS.styles);
        styles?.parentNode?.removeChild(styles);
    }
}

// Global instance and convenience functions
let vibeKitModalInstance = null;

function openModal(url, title) {
    try {
        if (!vibeKitModalInstance) {
            vibeKitModalInstance = new VibeKitModal();
        }
        vibeKitModalInstance.open(url, title);
    } catch (error) {
        throw error;
    }
}

function closeModal() {
    vibeKitModalInstance?.close();
}

// VibeKit button functionality
class VibeKitButton {
    static init() {
        document.addEventListener('click', VibeKitButton.handleClick);
        VibeKitButton.initWithRetry();
    }

    static handleClick(e) {
        const button = e.target.id === VibeKitModal.SELECTORS.button 
            ? e.target 
            : e.target.closest(`#${VibeKitModal.SELECTORS.button}`);
            
        if (!button) return;

        e.preventDefault();
        e.stopPropagation();
        
        const token = button.getAttribute('data-vibekit-token');
        if (!token) {
            alert('Error: No VibeKit token found. Please add data-vibekit-token attribute to the button.');
            return;
        }
        
        const url = `https://app.vibekit.sh/embed/${token}?embed=true`;
        
        try {
            openModal(url, 'VibeKit - Add to your app');
        } catch (error) {
            alert('Error opening modal: ' + error.message);
        }
    }

    static initWithRetry() {
        let attempts = 0;
        const { maxRetryAttempts, retryInterval } = VibeKitModal.DEFAULTS;
        
        function tryInit() {
            attempts++;
            const button = document.getElementById(VibeKitModal.SELECTORS.button);
            
            if (button || attempts >= maxRetryAttempts) return;
            
            setTimeout(tryInit, retryInterval);
        }
        
        tryInit();
    }
}

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', VibeKitButton.init);
} else {
    VibeKitButton.init();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VibeKitModal, openModal, closeModal };
}
