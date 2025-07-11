// Import types and specific functions/constants that might be needed by the outer shell
// before inlining. This helps with TypeScript checking for the main script file.
// The actual functions/constants from these modules will be globally available after inlining.
import type { Settings } from '../shared/settings-manager';
// No need to import specific functions like isViableBlock, createButton etc. here,
// as they will be part of the global scope after the inline build step.
// The /* INLINE:... */ comments will bring their definitions directly into this file.

/* INLINE:block-identifier */
/* INLINE:settings-manager */
/* INLINE:ui-injector */
/* INLINE:content-processor */

// Main content script logic

let currentTarget: Element | null = null;
let copyButtonElement: HTMLElement | null = null; // Holds the button instance from ui-injector
let isInitialized = false;
let isActive = false; // Tracks if Magic Copy features are currently active
let userSettings: Settings | null = null; // Will be populated by getSettings()
let lastClickPosition: { x: number; y: number } | null = null;

// Function to add all event listeners and inject UI
function enableMagicCopyFeatures(): void {
  if (isActive) return; // Already active

  // @ts-ignore: injectStyles is available from inlined ui-injector.ts
  injectStyles();

  // Ensure button is created if it was removed by disableMagicCopyFeatures
  if (!copyButtonElement) {
    // @ts-ignore: createButton is available from inlined ui-injector.ts
    copyButtonElement = createButton();
    setupButtonClickHandler(); // Re-setup click handler if button is recreated
  }

  document.addEventListener('click', handleDocumentClick, { passive: true });
  document.addEventListener('keydown', handleKeyDown, { passive: false });
  document.addEventListener('mouseover', handleMouseOver, { passive: true });
  document.addEventListener('mouseout', handleMouseOut, { passive: true });

  // The main 'cleanup' (which removes button and styles) is now handled by disableMagicCopyFeatures.
  // We might still want a specific beforeunload listener for other tasks if needed,
  // but the one from ui-injector.ts is for its own elements.
  // Let's assume the original intent for 'beforeunload' in content.ts was for ui-injector's cleanup.
  // This event listener is added here, and removeEventListener is in disableMagicCopyFeatures.
  // @ts-ignore: cleanup (from ui-injector) handles button and style tag removal
  window.addEventListener('beforeunload', cleanup);

  isActive = true;
  console.debug('AI Copilot: Magic Copy features enabled.');
}

// Function to remove all event listeners and UI elements
function disableMagicCopyFeatures(): void {
  if (!isActive) return; // Already inactive

  hideMagicCopy(); // Hide button if visible

  // @ts-ignore: cleanup function from ui-injector.ts will remove the button and styles
  if (typeof cleanup === 'function') {
    // @ts-ignore
    cleanup();
    copyButtonElement = null; // Ensure our reference is cleared as cleanup() removes it from DOM
  } else {
    // Fallback if cleanup is somehow not defined (should not happen with inlining)
    if (copyButtonElement) {
      copyButtonElement.remove();
      copyButtonElement = null;
    }
    const styleTag = document.getElementById('ai-copilot-styles'); // Corrected ID
    if (styleTag) {
      styleTag.remove();
    }
    console.warn('AI Copilot: ui-injector.cleanup() not found, attempting manual removal.');
  }

  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('mouseout', handleMouseOut);

  // @ts-ignore: Remove the specific beforeunload listener added by enableMagicCopyFeatures
  window.removeEventListener('beforeunload', cleanup);

  currentTarget = null; // Clear current target
  isActive = false;
  console.debug('AI Copilot: Magic Copy features disabled.');
}

// Unified function to show Magic Copy
function showMagicCopy(element: Element, event?: MouseEvent): void {
  if (!element) return;

  // @ts-ignore: hideButton is available from inlined ui-injector.ts
  if (currentTarget && currentTarget !== element && copyButtonElement) {
    // Hide from previous target if different
    // @ts-ignore: hideButton function is available from inlined ui-injector.ts
    hideButton(copyButtonElement, currentTarget instanceof HTMLElement ? currentTarget : null);
  }

  currentTarget = element;

  if (!copyButtonElement) {
    // @ts-ignore: createButton is available from inlined ui-injector.ts
    copyButtonElement = createButton();
    setupButtonClickHandler(); // Set up once
  }

  let x, y;
  if (event) {
    x = event.clientX;
    y = event.clientY;
    lastClickPosition = { x, y }; // Update lastClickPosition for consistency if needed by other features like Alt key
  } else {
    // Fallback positioning if no event (e.g. called programmatically without mouse context)
    // Position near the element's top-left corner or center.
    // This might need adjustment based on how showButton positions relative to x,y.
    const rect = element.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
    // Ensure button is within viewport, showButton might also do this
    x = Math.max(0, Math.min(x, window.innerWidth));
    y = Math.max(0, Math.min(y, window.innerHeight));
  }

  // @ts-ignore: showButton is available from inlined ui-injector.ts
  showButton(copyButtonElement, x, y, currentTarget instanceof HTMLElement ? currentTarget : null);
}

// Unified function to hide Magic Copy
function hideMagicCopy(): void {
  if (copyButtonElement && currentTarget) {
    // @ts-ignore: hideButton is available from inlined ui-injector.ts
    hideButton(copyButtonElement, currentTarget instanceof HTMLElement ? currentTarget : null);
  }
  currentTarget = null;
  // lastClickPosition = null; // Clearing lastClickPosition might be too aggressive if Alt key needs it.
  // Let's keep it unless it causes issues.
}

// Handles document click to identify potential target elements and show/hide the button.
function handleDocumentClick(event: MouseEvent): void {
  let potentialTargetNode = event.target as Node;

  // If the click is on the copy button itself, do nothing.
  if (copyButtonElement && copyButtonElement.contains(potentialTargetNode)) {
    return;
  }

  // Always hide any existing Magic Copy first (click or hover)
  hideMagicCopy();

  // If clicking over a text node, use its parent element.
  if (potentialTargetNode.nodeType === Node.TEXT_NODE) {
    potentialTargetNode = potentialTargetNode.parentElement || potentialTargetNode;
  }

  if (!(potentialTargetNode instanceof Element)) {
    // Clicked on something that isn't an element (e.g., document background)
    // Magic copy is already hidden by hideMagicCopy() above.
    return;
  }

  const clickedElement = potentialTargetNode;

  // @ts-ignore: isViableBlock is available from inlined block-identifier.ts
  if (isViableBlock(clickedElement)) {
    showMagicCopy(clickedElement, event);
  }
  // If not a viable block, Magic Copy remains hidden (already called hideMagicCopy).
}

// Handles keydown for parent element selection.
function handleKeyDown(event: KeyboardEvent): void {
  const isOnlyAltPressed = event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey;

  if (isOnlyAltPressed && currentTarget && copyButtonElement && lastClickPosition) {
    // Ensure lastClickPosition is available
    const oldTarget = currentTarget;
    const parent = currentTarget.parentElement;

    // @ts-ignore: EXCLUDED_TAGS is available from inlined block-identifier.ts
    if (
      parent &&
      parent !== document.body &&
      parent !== document.documentElement &&
      !EXCLUDED_TAGS.includes(parent.tagName.toLowerCase())
    ) {
      // 1. Clear border from the old currentTarget (child)
      if (oldTarget instanceof HTMLElement && oldTarget.dataset.originalBorder !== undefined) {
        oldTarget.style.border = oldTarget.dataset.originalBorder || 'none';
        delete oldTarget.dataset.originalBorder;
      }

      // 2. Update currentTarget to the new parent
      currentTarget = parent;

      // 3. Apply border to the new currentTarget (parent)
      if (currentTarget instanceof HTMLElement) {
        currentTarget.dataset.originalBorder = currentTarget.style.border;
        currentTarget.style.border = '1px solid #4F46E5'; // Using the same border style as in ui-injector
      }

      // 4. Reset button state (e.g., from "Copied!" back to copy icon)
      // @ts-ignore: updateButtonState is available from inlined ui-injector.ts
      updateButtonState(copyButtonElement, 'copy');

      // 5. Crucially, DO NOT reposition the button. It stays at lastClickPosition.
      // The button should already be visible. If we need to ensure it (e.g. if some other flow could hide it),
      // we might call `copyButtonElement.style.display = 'flex'`, but typically it would remain visible.
    }
  }
}

// Sets up the click handler for the copy button.
function setupButtonClickHandler(): void {
  if (!copyButtonElement) return;

  copyButtonElement.addEventListener('click', async (event: Event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!currentTarget || !userSettings) return;

    try {
      // @ts-ignore: processContent is available from inlined content-processor.ts
      const content = processContent(currentTarget, userSettings);
      if (!content.trim()) return;

      await navigator.clipboard.writeText(content);
      // @ts-ignore: updateButtonState is available from inlined ui-injector.ts
      updateButtonState(copyButtonElement!, 'copied');

      setTimeout(() => {
        if (copyButtonElement) {
          // @ts-ignore: updateButtonState is available from inlined ui-injector.ts
          updateButtonState(copyButtonElement, 'copy');
        }
      }, 1500);
    } catch (error) {
      console.error('Error copying content:', error);
      // Fallback copy mechanism
      try {
        const textarea = document.createElement('textarea');
        // @ts-ignore: processContent is available from inlined content-processor.ts
        textarea.value = processContent(currentTarget, userSettings!);
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        // @ts-ignore: updateButtonState is available from inlined ui-injector.ts
        updateButtonState(copyButtonElement!, 'copied');
        setTimeout(() => {
          if (copyButtonElement) {
            // @ts-ignore: updateButtonState is available from inlined ui-injector.ts
            updateButtonState(copyButtonElement, 'copy');
          }
        }, 1500);
      } catch (fallbackError) {
        console.error('Fallback copy method also failed:', fallbackError);
      }
    }
  });
}

// Loads settings and stores them in userSettings.
async function loadSettingsAndApply(): Promise<void> {
  try {
    // @ts-ignore: getSettings, DEFAULT_SETTINGS, getSystemLanguage are from inlined settings-manager.ts
    userSettings = await getSettings();
  } catch (error) {
    console.error('Error loading settings, using defaults:', error);
    // @ts-ignore
    userSettings = { ...DEFAULT_SETTINGS, language: getSystemLanguage() };
  }
}

// Target elements for hover-triggered Magic Copy
const HOVER_TARGET_TAGS = ['img', 'video', 'canvas', 'svg', 'picture', 'embed', 'object'];

// Handles mouseover events to show Magic Copy
function handleMouseOver(event: MouseEvent): void {
  const targetElement = event.target as Element;

  if (!targetElement || !(targetElement instanceof Element)) return;

  // Do not trigger hover if the mouse is over the copy button itself
  if (copyButtonElement && copyButtonElement.contains(targetElement)) {
    return;
  }

  const tagName = targetElement.tagName.toLowerCase();
  if (HOVER_TARGET_TAGS.includes(tagName)) {
    let width = 0;
    let height = 0;

    if (targetElement instanceof HTMLElement) {
      width = targetElement.clientWidth;
      height = targetElement.clientHeight;
    } else if (targetElement instanceof SVGElement) {
      const rect = targetElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    } else {
      // For other element types that might be in HOVER_TARGET_TAGS but are not HTMLElement or SVGElement
      // (e.g. <canvas> which is an HTMLCanvasElement, a subtype of HTMLElement, so covered)
      // We can use getBoundingClientRect as a fallback if needed, or assume they behave like HTMLElements.
      // For now, this path is less likely given current HOVER_TARGET_TAGS.
      const rect = targetElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    }

    if (width < 50 && height < 50) {
      // If the element is too small, also ensure any existing button is hidden,
      // especially if the mouse quickly moved from a valid target to a small icon.
      if (currentTarget === targetElement) {
        hideMagicCopy();
      }
      return; // Do not show Magic Copy for small elements
    }

    // If a different Magic Copy is already shown (e.g. from a click), hide it first.
    // Or if it's the same target, this effectively refreshes its position if mouse moved significantly.
    if (currentTarget !== targetElement) {
      hideMagicCopy(); // Hide previous before showing new, or if currentTarget is null this does nothing
    }
    showMagicCopy(targetElement, event);
  }
}

// Handles mouseout events to hide Magic Copy
function handleMouseOut(event: MouseEvent): void {
  const targetElement = event.target as Element;
  const relatedTarget = event.relatedTarget as Element;

  if (!currentTarget || !(targetElement instanceof Element)) return;

  // If the mouse is moving to the copy button, don't hide.
  if (copyButtonElement && relatedTarget && copyButtonElement.contains(relatedTarget)) {
    return;
  }

  // If the mouse is moving to a child of the currentTarget, don't hide.
  if (currentTarget.contains(relatedTarget)) {
    return;
  }

  // Hide if the mouse is leaving the currentTarget and not entering the button or a child.
  if (targetElement === currentTarget) {
    hideMagicCopy();
  }
}

// Initializes the content script.
async function initializeContentScript(): Promise<void> {
  if (isInitialized) return;

  try {
    console.debug('AI Copilot: Initializing content script...');
    await loadSettingsAndApply(); // Loads userSettings

    if (userSettings && userSettings.isMagicCopyEnabled) {
      enableMagicCopyFeatures();
    } else {
      // Ensure features are disabled if setting is false on init
      disableMagicCopyFeatures();
    }

    // Listen for settings changes from the popup/options page.
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        // @ts-ignore: SETTINGS_KEY, getSystemLanguage are from inlined settings-manager.ts
        if (areaName === 'local' && changes[SETTINGS_KEY]) {
          const oldSettings = userSettings ? { ...userSettings } : null;
          // @ts-ignore: SETTINGS_KEY is available from inlined settings-manager.ts
          const newSettingsValue = changes[SETTINGS_KEY].newValue as Settings;

          // Resolve language if 'system'
          if (newSettingsValue.language === 'system') {
            // @ts-ignore
            newSettingsValue.language = getSystemLanguage();
          }
          userSettings = newSettingsValue;
          console.debug('AI Copilot: Settings updated through storage listener.', userSettings);

          // Check if the isMagicCopyEnabled setting has changed
          if (oldSettings?.isMagicCopyEnabled !== userSettings.isMagicCopyEnabled) {
            if (userSettings.isMagicCopyEnabled) {
              enableMagicCopyFeatures();
            } else {
              disableMagicCopyFeatures();
            }
          }
        }
      });
    }

    isInitialized = true; // Mark as initialized regardless of feature state
    console.debug(
      'AI Copilot: Content script initialized successfully. Magic Copy enabled state:',
      isActive
    );
  } catch (error) {
    console.error('AI Copilot: Error initializing content script:', error);
  }
}

// Determines if the content script should run on the current page.
function shouldInitialize(): boolean {
  // Avoid running on chrome://, chrome-extension://, moz-extension:// pages
  const restrictedProtocols = ['chrome:', 'chrome-extension:', 'moz-extension:'];
  if (restrictedProtocols.includes(window.location.protocol)) {
    return false;
  }
  // Add any other specific conditions if needed, e.g., avoiding specific hostnames
  // if (window.frameElement && window.frameElement.tagName === "IFRAME") {
  //   console.debug("AI Copilot: Content script not initializing in an iframe.");
  //   return false; // Example: disable in iframes, though current code allows it.
  // }
  return true;
}

// Entry point for the content script.
if (shouldInitialize()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeContentScript);
  } else {
    initializeContentScript();
  }
}
