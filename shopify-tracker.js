/**
 * Comprehensive Shopify Customer Behavior Tracking Script
 * Tracks extensive metrics for ML prediction models
 */

const devMode = true;
console.log('%c🛍️ Advanced Shopify Tracker Started!', 'color: #4CAF50; font-weight: bold; font-size: 14px;');

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  const config = {
    apiEndpoint: 'http://localhost:8000/ingest',
    trackPageViews: true,
    trackClicks: true,
    trackScrollDepth: true,
    trackTimeOnPage: true,
    trackProducts: true,
    trackCartActions: true,
    trackSearch: true,
    trackEngagement: true,
    trackPerformance: true,
    debugMode: devMode || false,
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    batchSize: 10, // Batch events before sending
    consentRequired: false  // Set to true in production after implementing consent banner
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function generateSessionId() {
    try {
      const stored = sessionStorage.getItem('tracker_session_id');
      if (stored) return stored;
      const id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('tracker_session_id', id);
      return id;
    } catch (e) {
      // Fallback if sessionStorage is unavailable (sandboxed iframe, etc.)
      if (!window._trackerSessionId) {
        window._trackerSessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      }
      return window._trackerSessionId;
    }
  }

  function getOrCreateAnonymousId() {
    try {
      let anonId = localStorage.getItem('tracker_anonymous_id');
      if (!anonId) {
        // Create fingerprint-based anonymous ID
        const fingerprint = generateFingerprint();
        anonId = 'anon_' + btoa(fingerprint).substr(0, 16).replace(/[^a-zA-Z0-9]/g, '');
        localStorage.setItem('tracker_anonymous_id', anonId);
      }
      return anonId;
    } catch (e) {
      // Fallback if localStorage is unavailable
      if (!window._trackerAnonymousId) {
        const fingerprint = generateFingerprint();
        window._trackerAnonymousId = 'anon_' + btoa(fingerprint).substr(0, 16).replace(/[^a-zA-Z0-9]/g, '');
      }
      return window._trackerAnonymousId;
    }
  }

  function generateFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Fingerprint', 2, 2);
    
    return [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      canvas.toDataURL()
    ].join('|');
  }

  async function hashCustomerId(customerId) {
    if (!customerId) return null;
    // Simple hash function (for production, use crypto.subtle.digest)
    const encoder = new TextEncoder();
    const data = encoder.encode(customerId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getStoreId() {
    if (window.Shopify && window.Shopify.shop) {
      return window.Shopify.shop;
    }
    // Fallback: extract from domain
    return window.location.hostname.replace('.myshopify.com', '');
  }

  function getUserId() {
    // Check for Shopify customer ID
    if (window.Shopify && window.Shopify.customerId) {
      return window.Shopify.customerId;
    }
    // Check meta tags
    const metaCustomer = document.querySelector('meta[name="customer-id"]');
    if (metaCustomer) {
      return metaCustomer.content;
    }
    return null;
  }

  function parseUTMParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || null,
      utm_medium: params.get('utm_medium') || null,
      utm_campaign: params.get('utm_campaign') || null,
      utm_term: params.get('utm_term') || null,
      utm_content: params.get('utm_content') || null
    };
  }

  function detectPageType() {
    const path = window.location.pathname.toLowerCase();
    const hostname = window.location.hostname.toLowerCase();
    const urlParams = new URLSearchParams(window.location.search);
    
    // Check if on Shopify checkout domain
    if (hostname.includes('checkout.shopify.com') || hostname.includes('checkout')) {
      // Check if it's order confirmation page
      if (path.includes('thank_you') || 
          path.includes('thank-you') || 
          path.includes('success') ||
          urlParams.has('order') ||
          document.querySelector('.order-confirmation, [data-order-id], .thank-you, .order-status')) {
        return 'order_confirmation';
      }
      return 'checkout';
    }
    
    // Check for order confirmation pages
    if (path.includes('/thank_you') || 
        path.includes('/thank-you') || 
        path.includes('/success') ||
        path.includes('/order-confirmation') ||
        urlParams.has('order') ||
        urlParams.has('checkout_id')) {
      return 'order_confirmation';
    }
    
    if (path === '/' || path === '/index') return 'home';
    if (path.includes('/collections/')) return 'collection';
    if (path.includes('/products/')) return 'product';
    if (path.includes('/cart')) return 'cart';
    if (path.includes('/checkout') || path.includes('/checkouts/')) return 'checkout';
    if (path.includes('/orders/')) return 'order_status';
    if (path.includes('/search')) return 'search';
    if (path.includes('/blogs/') || path.includes('/blog/')) return 'blog';
    if (path.includes('/account')) return 'account';
    return 'other';
  }

  function parseUserAgent() {
    const ua = navigator.userAgent;
    let browser = 'unknown';
    let os = 'unknown';
    let deviceType = 'desktop';

    // Browser detection
    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'chrome';
    else if (ua.includes('Firefox')) browser = 'firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'safari';
    else if (ua.includes('Edg')) browser = 'edge';
    else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'opera';

    // OS detection
    if (ua.includes('Windows')) os = 'windows';
    else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) os = 'macos';
    else if (ua.includes('Linux')) os = 'linux';
    else if (ua.includes('Android')) os = 'android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'ios';

    // Device type
    if (/Mobi|Android|iPhone|iPad/i.test(ua)) deviceType = 'mobile';
    else if (/Tablet|iPad/i.test(ua)) deviceType = 'tablet';

    return { browser, os, deviceType };
  }

  function getLocalTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
      return null;
    }
  }

  function getConsentStatus() {
    const consent = {
      gdpr: {
        required: false,
        consented: false,
        timestamp: null
      },
      ccpa: {
        required: false,
        opted_out: false,
        timestamp: null
      },
      marketing: {
        opted_in: false,
        timestamp: null
      }
    };

    // Check localStorage for consent
    try {
      const storedConsent = localStorage.getItem('tracker_consent');
      if (storedConsent) {
        try {
          const parsed = JSON.parse(storedConsent);
          Object.assign(consent, parsed);
        } catch (e) {
          // Invalid consent data
        }
      }
    } catch (e) {
      // localStorage unavailable, check memory fallback
      if (window._trackerConsent) {
        Object.assign(consent, window._trackerConsent);
      }
    }

    return consent;
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  const trackerState = {
    sessionId: generateSessionId(),
    anonymousId: getOrCreateAnonymousId(),
    userId: null,
    hashedUserId: null,
    storeId: getStoreId(),
    sessionStartTime: new Date(),
    pageStartTime: new Date(),
    events: [],
    currentPage: {
      type: detectPageType(),
      url: window.location.href,
      referrer: document.referrer,
      title: document.title
    },
    cart: {
      id: null,
      total: 0,
      items: [],
      itemCount: 0
    },
    performance: {
      pageLoadTime: null,
      apiResponseTimes: []
    },
    engagement: {
      scrollDepth: 0,
      timeOnPage: 0,
      clicks: [],
      hovers: new Map(),
      videoPlays: []
    },
    search: {
      query: null,
      resultsCount: null,
      filters: {},
      sortBy: null,
      pageNumber: 1
    },
    checkout: {
      step: null,
      completed: false,
      shippingMethod: null,
      paymentMethodType: null
    },
    flags: {
      cartAbandonSent: false,
      sessionEndSent: false
    }
  };

  // Initialize user ID
  (async () => {
    const userId = getUserId();
    if (userId) {
      trackerState.userId = userId;
      trackerState.hashedUserId = await hashCustomerId(userId.toString());
    }
  })();

  // ============================================================================
  // EVENT TRACKING CORE
  // ============================================================================

  function createEvent(eventType, eventData = {}) {
    const event = {
      event_id: generateUUID(),
      event_type: eventType,
      timestamp: new Date().toISOString(),
      store_id: trackerState.storeId,
      session_id: trackerState.sessionId,
      user_id: trackerState.hashedUserId,
      anonymous_id: trackerState.anonymousId,
      consent: getConsentStatus(),
      ...eventData
    };

    // Add page context
    event.page_type = trackerState.currentPage.type;
    event.page_url = trackerState.currentPage.url;
    event.referrer = trackerState.currentPage.referrer;
    
    // Add UTM params
    const utmParams = parseUTMParams();
    Object.assign(event, utmParams);

    // Add device context
    const uaInfo = parseUserAgent();
    event.browser = uaInfo.browser;
    event.device_type = uaInfo.deviceType;
    event.os = uaInfo.os;
    event.screen_resolution = `${screen.width}x${screen.height}`;
    event.local_time_zone = getLocalTimeZone();
    
    // Note: location (country, region, city) should be enriched server-side from IP
    // Do not send exact lat/lon client-side unless user has consented

    // Add performance metrics if available and valid
    if (trackerState.performance.pageLoadTime && 
        trackerState.performance.pageLoadTime > 0 && 
        trackerState.performance.pageLoadTime < 300000) { // Max 5 minutes
      event.page_load_time_ms = Math.round(trackerState.performance.pageLoadTime);
    }

    return event;
  }

  function trackEvent(eventType, eventData = {}) {
    // Check consent if required, but allow tracking in dev mode for testing
    if (config.consentRequired && !config.debugMode) {
      const consent = getConsentStatus();
      if (!consent.gdpr.consented && consent.gdpr.required) {
        debugLog('Event tracking blocked - no consent', { eventType }, 'warning');
        return;
      }
    }

    const event = createEvent(eventType, eventData);
    trackerState.events.push(event);
    
    debugLog(`📊 Event: ${eventType}`, event, 'event');
    
    // Send event immediately for critical events
    const criticalEvents = ['purchase', 'checkout_start', 'cart_abandon'];
    if (criticalEvents.includes(eventType)) {
      sendEvent(event);
    } else if (trackerState.events.length >= config.batchSize) {
      sendBatchEvents();
    }

    return event.event_id;
  }

  // ============================================================================
  // PRODUCT TRACKING
  // ============================================================================

  async function extractProductData(productElement, variantId = null) {
    const productData = {
      product_id: null,
      variant_id: variantId,
      title: null,
      brand: null,
      category: null,
      price: null,
      list_price: null,
      currency: window.Shopify?.currency?.active || 'USD',
      quantity: 1,
      tags: [],
      attributes: {}
    };

    // Try to get product ID from data attributes
    productData.product_id = productElement.dataset.productId || 
                             productElement.dataset.productHandle ||
                             productElement.querySelector('[data-product-id]')?.dataset.productId;

    // Try to get variant ID
    if (!variantId) {
      productData.variant_id = productElement.dataset.variantId ||
                               productElement.querySelector('[data-variant-id]')?.dataset.variantId;
    }

    // Extract title
    const titleEl = productElement.querySelector('.product-title, .product__title, h2, h3');
    if (titleEl) productData.title = titleEl.textContent.trim();

    // Extract price
    const priceEl = productElement.querySelector('.price, .product-price, [data-price]');
    if (priceEl) {
      const priceText = priceEl.textContent.replace(/[^0-9.]/g, '');
      productData.price = parseFloat(priceText) || null;
    }

    // Extract compare at price
    const comparePriceEl = productElement.querySelector('.compare-at-price, .product-compare-price');
    if (comparePriceEl) {
      const compareText = comparePriceEl.textContent.replace(/[^0-9.]/g, '');
      productData.list_price = parseFloat(compareText) || null;
    }

    // Try to fetch full product data from Shopify API if product handle is available
    const handle = productElement.dataset.productHandle;
    if (handle && window.Shopify) {
      try {
        const response = await fetch(`/products/${handle}.js`);
        if (response.ok) {
          const product = await response.json();
          productData.product_id = product.id;
          productData.title = product.title;
          productData.brand = product.vendor;
          productData.category = product.product_type;
          productData.tags = product.tags || [];
          
          // Get variant data
          if (productData.variant_id) {
            const variant = product.variants.find(v => v.id.toString() === productData.variant_id.toString());
            if (variant) {
              productData.variant_id = variant.id;
              productData.price = variant.price / 100; // Shopify prices are in cents
              productData.list_price = variant.compare_at_price ? variant.compare_at_price / 100 : null;
              productData.inventory_level = variant.inventory_quantity;
              productData.inventory_policy = variant.inventory_policy;
              
              // Extract variant attributes
              productData.attributes = variant.options.reduce((acc, opt, idx) => {
                acc[product.options[idx]?.toLowerCase() || `option${idx + 1}`] = opt;
                return acc;
              }, {});

              // Check for bundle information
              if (variant.metafields) {
                const bundleMetafield = variant.metafields.find(m => m.key === 'bundle_id' || m.namespace === 'bundle');
                if (bundleMetafield) {
                  productData.bundle_id = bundleMetafield.value;
                }
              }
            }
          }

          // Check for promotion/discount
          if (product.metafields) {
            const promoMetafield = product.metafields.find(m => 
              m.key === 'promotion_id' || m.namespace === 'promotion'
            );
            if (promoMetafield) {
              productData.promotion_id = promoMetafield.value;
            }
          }

          // Check for bundle at product level
          if (product.tags) {
            const bundleTag = product.tags.find(tag => tag.toLowerCase().includes('bundle'));
            if (bundleTag) {
              productData.bundle_id = bundleTag;
            }
          }
        }
      } catch (e) {
        debugLog('Error fetching product data', e, 'warning');
      }
    }

    // Check for promotion in DOM
    const promoEl = productElement?.querySelector('[data-promotion], .promotion-badge, [data-discount]');
    if (promoEl && !productData.promotion_id) {
      productData.promotion_id = promoEl.dataset.promotion || promoEl.textContent.trim();
    }

    return productData;
  }

  // ============================================================================
  // CART TRACKING
  // ============================================================================

  async function fetchCartData() {
    try {
      let cart = null;
      let response = null;
      
      // Try the standard Shopify cart endpoint first
      try {
        response = await fetch('/cart.js', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          cart = await response.json();
        }
      } catch (e) {
        debugLog('Error fetching /cart.js', e, 'warning');
      }
      
      // If first attempt failed, try alternative endpoint
      if (!cart) {
        try {
          response = await fetch('/cart.json', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            cart = await response.json();
          }
        } catch (e) {
          debugLog('Error fetching /cart.json', e, 'warning');
        }
      }
      
      if (!cart) {
        throw new Error('Failed to fetch cart from both endpoints');
      }
      
      // Update cart state
      trackerState.cart.id = cart.token || cart.id || generateUUID();
      trackerState.cart.total = (cart.total_price || cart.total || 0) / 100;
      trackerState.cart.itemCount = cart.item_count || cart.items?.length || 0;
      
      // Map cart items (handle both formats)
      trackerState.cart.items = (cart.items || []).map((item) => ({
        product_id: item.product_id?.toString() || item.product?.id?.toString(),
        variant_id: item.variant_id?.toString() || item.variant?.id?.toString(),
        title: item.product_title || item.title || item.product?.title,
        quantity: item.quantity || 1,
        price: (item.price || item.line_price || 0) / 100,
        currency: cart.currency || window.Shopify?.currency?.active || 'USD',
        key: item.key || item.id?.toString() || item.variant_id?.toString() // Line item key
      }));

      debugLog('Cart data fetched', {
        itemCount: trackerState.cart.itemCount,
        total: trackerState.cart.total,
        items: trackerState.cart.items.length
      }, 'event');

      return trackerState.cart;
    } catch (error) {
      debugLog('Error fetching cart', error, 'warning');
      // Return existing cart state if fetch fails
      return trackerState.cart.itemCount > 0 ? trackerState.cart : null;
    }
  }

  // ============================================================================
  // PAGE TRACKING
  // ============================================================================

  function trackPageView() {
    trackerState.currentPage = {
      type: detectPageType(),
      url: window.location.href,
      referrer: document.referrer,
      title: document.title
    };
    trackerState.pageStartTime = new Date();
    trackerState.engagement.scrollDepth = 0;
    trackerState.engagement.timeOnPage = 0;

    trackEvent('page_view', {
      page_type: trackerState.currentPage.type,
      page_url: trackerState.currentPage.url,
      referrer: trackerState.currentPage.referrer
    });
    
    // If we're on checkout page, trigger checkout tracking
    if (trackerState.currentPage.type === 'checkout') {
      setupCheckoutPageDetails();
    }
    
    // If we're on order confirmation page, track purchase
    if (trackerState.currentPage.type === 'order_confirmation') {
      setupPurchaseTracking();
    }
    
    // Initialize cart on all pages (to keep state up to date)
    fetchCartData().then(cart => {
      if (cart) {
        debugLog('Cart initialized', { itemCount: cart.itemCount, total: cart.total }, 'event');
      }
    });
  }

  // ============================================================================
  // PRODUCT VIEW TRACKING
  // ============================================================================

  function setupProductViewTracking() {
    if (trackerState.currentPage.type !== 'product') return;

    const productForm = document.querySelector('form[action*="/cart/add"]');
    if (!productForm) return;

    (async () => {
      const productData = await extractProductData(document.body);
      trackEvent('product_view', {
        product_id: productData.product_id,
        variant_id: productData.variant_id,
        title: productData.title,
        brand: productData.brand,
        category: productData.category,
        price: productData.price,
        list_price: productData.list_price,
        currency: productData.currency,
        tags: productData.tags,
        attributes: productData.attributes
      });
    })();
  }

  // ============================================================================
  // PRODUCT IMPRESSION TRACKING
  // ============================================================================

  function setupProductImpressionTracking() {
    const products = document.querySelectorAll('[data-product-handle], [data-product-id], .product-card, .product-item');
    let impressionIndex = 0;

    products.forEach((product, index) => {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            impressionIndex++;
            (async () => {
              const productData = await extractProductData(entry.target);
              trackEvent('product_impression', {
                ...productData,
                impression_index: impressionIndex,
                page_type: trackerState.currentPage.type
              });
            })();
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5, rootMargin: '50px' });
      
      observer.observe(product);
    });
  }

  // ============================================================================
  // CART TRACKING
  // ============================================================================

  function setupCartTracking() {
    // Track add to cart via form submissions (more reliable than just clicks)
    document.body.addEventListener('submit', async function(e) {
      const form = e.target;
      if (!form || !form.action) return;
      
      // Check if this is a cart add form
      if (form.action.includes('/cart/add') || form.action.includes('/cart')) {
        // Don't prevent default - let Shopify handle the form submission normally
        
        const formData = new FormData(form);
        const variantId = form.querySelector('[name="id"]')?.value || formData.get('id');
        const quantity = parseInt(form.querySelector('[name="quantity"]')?.value || formData.get('quantity') || '1') || 1;
        
        debugLog('Add to cart form submission detected', {
          variantId: variantId,
          quantity: quantity,
          action: form.action
        }, 'event');
        
        // Extract product data before form submission
        const productElement = form.closest('.product, [data-product-id], .product-form, .product-item') || document.body;
        const productData = await extractProductData(productElement);
        
        // Store tracking data for after form submission completes
        const trackingData = {
          product_id: productData.product_id || form.dataset.productId || null,
          variant_id: productData.variant_id || variantId || form.dataset.variantId || null,
          title: productData.title || null,
          quantity: quantity,
          price: productData.price || null,
          currency: productData.currency || 'USD'
        };
        
        // Wait for Shopify to process the add to cart (allow form to submit normally)
        setTimeout(async () => {
          const cart = await fetchCartData();
          
          trackEvent('add_to_cart', {
            cart_id: cart?.id || trackerState.cart.id || null,
            cart_total: cart?.total || trackerState.cart.total || null,
            cart_items: cart?.items || trackerState.cart.items || [],
            cart_item_count: cart?.itemCount || trackerState.cart.itemCount || 0,
            ...trackingData
          });
        }, 1000);
      }
    });
    
    // Track add to cart via click events (for AJAX cart buttons)
    document.body.addEventListener('click', async function(e) {
      // More specific selectors for add to cart buttons
      const addToCartBtn = e.target.closest(
        '[name="add"], ' +
        '.add-to-cart, ' +
        '[data-add-to-cart], ' +
        'button[aria-label*="Add"], ' +
        'button[aria-label*="add"], ' +
        '.product-form__cart-submit, ' +
        '.btn-cart, ' +
        '[id*="add-to-cart"], ' +
        '[class*="add-to-cart"], ' +
        'button[type="submit"]'
      );
      
      if (!addToCartBtn) return;
      
      // Skip if this is a form submit button (handled by form submit listener)
      const form = addToCartBtn.closest('form');
      if (form && (form.action.includes('/cart/add') || form.action.includes('/cart'))) {
        return; // Let form submit handler take care of it
      }

      // Check if this is likely an add-to-cart button
      const btnText = (addToCartBtn.textContent || '').toLowerCase();
      const isAddToCart = btnText.includes('add') && (btnText.includes('cart') || btnText.includes('bag'));
      
      // Also check for AJAX cart attributes
      const hasAjaxCart = addToCartBtn.dataset.variantId || 
                          addToCartBtn.dataset.productId ||
                          addToCartBtn.closest('[data-product-id]') ||
                          addToCartBtn.closest('.product-form');

      if (!hasAjaxCart && !isAddToCart) {
        // Not an add-to-cart button
        return;
      }

      debugLog('Add to cart button clicked (AJAX)', {
        hasAjaxCart: !!hasAjaxCart,
        isAddToCart: isAddToCart,
        variantId: addToCartBtn.dataset.variantId
      });

      // Try to extract product data immediately (before AJAX completes)
      const productElement = addToCartBtn.closest('.product, [data-product-id], .product-form, .product-item') ||
                             document.body;
      const productData = await extractProductData(productElement);

      // Wait a bit for Shopify AJAX to complete, then fetch cart data
      setTimeout(async () => {
        const cart = await fetchCartData();
        if (!cart) {
          // If cart fetch fails, still track the event with what we have
          debugLog('Cart fetch failed, tracking with available product data', {}, 'warning');
        }

        trackEvent('add_to_cart', {
          cart_id: cart?.id || trackerState.cart.id || null,
          cart_total: cart?.total || trackerState.cart.total || null,
          cart_items: cart?.items || trackerState.cart.items || [],
          cart_item_count: cart?.itemCount || trackerState.cart.itemCount || 0,
          product_id: productData.product_id || addToCartBtn.dataset.productId || null,
          variant_id: productData.variant_id || addToCartBtn.dataset.variantId || null,
          title: productData.title || null,
          quantity: productData.quantity || 1,
          price: productData.price || null,
          currency: productData.currency || 'USD'
        });
      }, 1000); // Wait for Shopify AJAX to complete
    });
    
    // Track remove from cart
    document.body.addEventListener('click', async function(e) {
      const removeBtn = e.target.closest(
        '[data-remove], ' +
        '.cart__remove, ' +
        '.cart-item-remove, ' +
        'a[href*="/cart/change"], ' +
        'button[aria-label*="Remove"], ' +
        'button[aria-label*="remove"], ' +
        '[class*="remove"], ' +
        '[class*="delete"]'
      );
      
      if (!removeBtn) return;
      
      // Check if this is likely a remove button
      const btnText = (removeBtn.textContent || '').toLowerCase();
      const isRemove = btnText.includes('remove') || btnText.includes('delete') || 
                       removeBtn.href?.includes('/cart/change') ||
                       removeBtn.dataset.remove;
      
      if (!isRemove) return;
      
      // Get line item key or variant ID before removal
      const lineItemKey = removeBtn.dataset.key || 
                         removeBtn.closest('[data-key]')?.dataset.key ||
                         removeBtn.href?.match(/line=(\d+)/)?.[1] ||
                         removeBtn.closest('[data-variant-id]')?.dataset.variantId;
      
      const itemElement = removeBtn.closest('.cart-item, [data-variant-id], [data-line]');
      const variantId = itemElement?.dataset.variantId || lineItemKey;
      const productId = itemElement?.dataset.productId;
      
      debugLog('Remove from cart detected', {
        lineItemKey: lineItemKey,
        variantId: variantId,
        productId: productId
      }, 'event');
      
      // Get current cart state before removal
      const cartBefore = await fetchCartData();
      const itemToRemove = cartBefore?.items?.find(item => 
        item.key === lineItemKey || 
        item.variant_id === variantId?.toString()
      );
      
      // Wait for removal to complete
      setTimeout(async () => {
        const cart = await fetchCartData();
        
        trackEvent('remove_from_cart', {
          cart_id: cart?.id || trackerState.cart.id || null,
          cart_total: cart?.total || trackerState.cart.total || null,
          cart_items: cart?.items || trackerState.cart.items || [],
          cart_item_count: cart?.itemCount || trackerState.cart.itemCount || 0,
          product_id: itemToRemove?.product_id || productId || null,
          variant_id: itemToRemove?.variant_id || variantId || null,
          title: itemToRemove?.title || null,
          quantity: itemToRemove?.quantity || null,
          price: itemToRemove?.price || null,
          currency: itemToRemove?.currency || 'USD'
        });
      }, 500);
    });
    
    // Track quantity updates in cart
    document.body.addEventListener('change', async function(e) {
      const quantityInput = e.target.closest(
        'input[name="quantity"], ' +
        'input[name="updates[]"], ' +
        '.cart__quantity-input, ' +
        '[data-quantity-input], ' +
        'input[type="number"]'
      );
      
      if (!quantityInput) return;
      
      // Check if this is a cart quantity input
      const isCartQuantity = quantityInput.closest('.cart, [data-cart]') ||
                            quantityInput.name === 'quantity' ||
                            quantityInput.name === 'updates[]' ||
                            quantityInput.classList.contains('cart__quantity-input');
      
      if (!isCartQuantity) return;
      
      const oldQuantity = parseInt(quantityInput.dataset.oldQuantity || quantityInput.defaultValue || '0') || 0;
      const newQuantity = parseInt(quantityInput.value || '0') || 0;
      
      if (oldQuantity === newQuantity) return; // No change
      
      const itemElement = quantityInput.closest('.cart-item, [data-variant-id], [data-line]');
      const variantId = itemElement?.dataset.variantId;
      const productId = itemElement?.dataset.productId;
      const lineItemKey = itemElement?.dataset.key || itemElement?.dataset.line;
      
      // Store current value as old value for next change
      quantityInput.dataset.oldQuantity = newQuantity.toString();
      
      debugLog('Cart quantity update detected', {
        variantId: variantId,
        oldQuantity: oldQuantity,
        newQuantity: newQuantity
      }, 'event');
      
      // Get item details from current cart
      const cartBefore = await fetchCartData();
      const item = cartBefore?.items?.find(item => 
        item.key === lineItemKey || 
        item.variant_id === variantId?.toString()
      );
      
      // Wait for update to complete
      setTimeout(async () => {
        const cart = await fetchCartData();
        
        if (newQuantity === 0) {
          // Quantity set to 0 = removal
          trackEvent('remove_from_cart', {
            cart_id: cart?.id || trackerState.cart.id || null,
            cart_total: cart?.total || trackerState.cart.total || null,
            cart_items: cart?.items || trackerState.cart.items || [],
            cart_item_count: cart?.itemCount || trackerState.cart.itemCount || 0,
            product_id: item?.product_id || productId || null,
            variant_id: item?.variant_id || variantId || null,
            title: item?.title || null,
            quantity: oldQuantity,
            price: item?.price || null,
            currency: item?.currency || 'USD'
          });
        } else if (newQuantity > oldQuantity) {
          // Quantity increased
          trackEvent('cart_quantity_increase', {
            cart_id: cart?.id || trackerState.cart.id || null,
            cart_total: cart?.total || trackerState.cart.total || null,
            cart_items: cart?.items || trackerState.cart.items || [],
            cart_item_count: cart?.itemCount || trackerState.cart.itemCount || 0,
            product_id: item?.product_id || productId || null,
            variant_id: item?.variant_id || variantId || null,
            title: item?.title || null,
            old_quantity: oldQuantity,
            new_quantity: newQuantity,
            quantity_change: newQuantity - oldQuantity,
            price: item?.price || null,
            currency: item?.currency || 'USD'
          });
        } else {
          // Quantity decreased
          trackEvent('cart_quantity_decrease', {
            cart_id: cart?.id || trackerState.cart.id || null,
            cart_total: cart?.total || trackerState.cart.total || null,
            cart_items: cart?.items || trackerState.cart.items || [],
            cart_item_count: cart?.itemCount || trackerState.cart.itemCount || 0,
            product_id: item?.product_id || productId || null,
            variant_id: item?.variant_id || variantId || null,
            title: item?.title || null,
            old_quantity: oldQuantity,
            new_quantity: newQuantity,
            quantity_change: oldQuantity - newQuantity,
            price: item?.price || null,
            currency: item?.currency || 'USD'
          });
        }
      }, 500);
    });
    
    // Initialize quantity inputs with old values
    setTimeout(() => {
      document.querySelectorAll('input[name="quantity"], input[name="updates[]"], .cart__quantity-input').forEach(input => {
        if (!input.dataset.oldQuantity) {
          input.dataset.oldQuantity = input.value || input.defaultValue || '0';
        }
      });
    }, 1000);

    // Track cart updates via Shopify AJAX events (multiple event names for compatibility)
    const cartEventNames = [
      'ajaxCart:added',
      'ajax:added',
      'cart:updated',
      'shopify:cart:updated',
      'cart-update',
      'cart:change'
    ];
    
    cartEventNames.forEach(eventName => {
      document.addEventListener(eventName, async (e) => {
        debugLog(`Cart event detected: ${eventName}`, {}, 'event');
        
        // Wait a bit for cart to update
        setTimeout(async () => {
          const cart = await fetchCartData();
          if (cart) {
            trackEvent('cart_update', {
              cart_id: trackerState.cart.id,
              cart_total: trackerState.cart.total,
              cart_items: trackerState.cart.items,
              cart_item_count: trackerState.cart.itemCount
            });
          }
        }, 300);
      });
    });

    // Also listen to window events (some themes use window-level events)
    cartEventNames.forEach(eventName => {
      window.addEventListener(eventName, async (e) => {
        debugLog(`Cart window event detected: ${eventName}`, {}, 'event');
        setTimeout(async () => {
          const cart = await fetchCartData();
          if (cart) {
            trackEvent('cart_update', {
              cart_id: trackerState.cart.id,
              cart_total: trackerState.cart.total,
              cart_items: trackerState.cart.items,
              cart_item_count: trackerState.cart.itemCount
            });
          }
        }, 300);
      });
    });
    
    // Intercept fetch calls to cart API to track cart changes
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      const method = args[1]?.method || 'GET';
      
      // Check if this is a cart-related API call
      const isCartAPI = url && (
        url.includes('/cart/add') || 
        url.includes('/cart/change') || 
        url.includes('/cart/update') ||
        url.includes('/cart.js') ||
        url.includes('/cart.json')
      );
      
      // Execute the fetch normally first
      const fetchPromise = originalFetch.apply(this, args);
      
      // If it's a cart-modifying operation, track it after completion
      if (isCartAPI && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        debugLog(`Cart API call detected: ${method} ${url}`, {}, 'event');
        
        // Track cart update after fetch completes (don't block the fetch)
        fetchPromise.then(async (response) => {
          // Wait a bit for cart to update on server
          setTimeout(async () => {
            try {
              const cart = await fetchCartData();
              if (cart) {
                trackEvent('cart_update', {
                  cart_id: trackerState.cart.id,
                  cart_total: trackerState.cart.total,
                  cart_items: trackerState.cart.items,
                  cart_item_count: trackerState.cart.itemCount
                });
              }
            } catch (error) {
              debugLog('Error tracking cart update after API call', error, 'warning');
            }
          }, 500);
        }).catch((error) => {
          debugLog('Cart API call failed', error, 'warning');
        });
      }
      
      return fetchPromise;
    };
    
    // Watch for cart DOM changes (some themes update cart via DOM manipulation)
    const cartObserver = new MutationObserver((mutations) => {
      let cartChanged = false;
      
      mutations.forEach((mutation) => {
        // Check if cart-related elements changed
        const target = mutation.target;
        if (target && (
          target.classList?.contains('cart') ||
          target.closest('.cart') ||
          target.classList?.contains('cart-drawer') ||
          target.closest('.cart-drawer') ||
          target.querySelector('.cart-item, .cart__item, [data-cart-item]')
        )) {
          cartChanged = true;
        }
      });
      
      if (cartChanged) {
        // Debounce cart updates
        clearTimeout(cartObserver.updateTimer);
        cartObserver.updateTimer = setTimeout(async () => {
          const cart = await fetchCartData();
          if (cart) {
            debugLog('Cart DOM changed - cart updated', { itemCount: cart.itemCount }, 'event');
          }
        }, 500);
      }
    });
    
    // Start observing cart-related containers
    setTimeout(() => {
      const cartContainers = document.querySelectorAll('.cart, .cart-drawer, [data-cart], #cart, [id*="cart"]');
      cartContainers.forEach(container => {
        cartObserver.observe(container, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-quantity', 'data-variant-id', 'data-product-id']
        });
      });
      
      // Also observe document body for dynamically added cart elements
      cartObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }, 1000);

    // Track cart abandonment (when user leaves with items in cart)
    // Note: This is handled in the main beforeunload handler below to avoid duplicates
  }

  // ============================================================================
  // CHECKOUT TRACKING
  // ============================================================================

  function setupCheckoutTracking() {
    // Track checkout button clicks from cart page
    document.body.addEventListener('click', function(e) {
      const checkoutBtn = e.target.closest(
        'a[href*="/checkout"], ' +
        'a[href*="checkout.shopify.com"], ' +
        'button[name="checkout"], ' +
        '.checkout, ' +
        '[data-checkout], ' +
        '.cart__checkout, ' +
        '.cart-checkout, ' +
        '.btn-checkout, ' +
        'button.btn-checkout'
      );
      
      if (checkoutBtn) {
        const btnText = (checkoutBtn.textContent || checkoutBtn.value || '').toLowerCase();
        const isCheckoutBtn = btnText.includes('checkout') || 
                             checkoutBtn.href?.includes('checkout') ||
                             checkoutBtn.name === 'checkout' ||
                             checkoutBtn.classList.contains('checkout') ||
                             checkoutBtn.dataset.checkout;
        
        if (isCheckoutBtn) {
          debugLog('Checkout button clicked', {
            href: checkoutBtn.href,
            name: checkoutBtn.name,
            text: btnText
          }, 'event');
          
          // Fetch cart data before redirecting to checkout
          (async () => {
            const cart = await fetchCartData();
            trackEvent('checkout_start', {
              checkout_step: 1,
              cart_id: cart?.id || trackerState.cart.id || null,
              cart_total: cart?.total || trackerState.cart.total || null,
              cart_items: cart?.items || trackerState.cart.items || [],
              cart_item_count: cart?.itemCount || trackerState.cart.itemCount || 0
            });
          })();
        }
      }
    });
    
    // Track checkout page details if we're on checkout page (call this from page view tracking)
    if (trackerState.currentPage.type === 'checkout') {
      setupCheckoutPageDetails();
    }
  }
  
  function setupCheckoutPageDetails() {
    if (trackerState.currentPage.type !== 'checkout') return;
    
    debugLog('On checkout page - initializing checkout tracking', {}, 'event');
    
    // Fetch cart data when landing on checkout page
    (async () => {
      const cart = await fetchCartData();
      if (cart) {
        debugLog('On checkout page - cart loaded', { itemCount: cart.itemCount }, 'event');
      }
    })();

    // Detect checkout step
    const stepIndicators = document.querySelectorAll('.step, .checkout-step, [data-step]');
    let currentStep = 1;
    if (stepIndicators.length > 0) {
      stepIndicators.forEach((step, idx) => {
        if (step.classList.contains('active') || step.classList.contains('current')) {
          currentStep = idx + 1;
        }
      });
    }
    trackerState.checkout.step = currentStep;

    // Extract coupon code
    const couponInput = document.querySelector('input[name="discount"], input[name="coupon"], [data-discount-code]');
    const couponCode = couponInput?.value || null;

    // Extract shipping method
    const shippingSelect = document.querySelector('select[name="shipping_method"], [data-shipping-method]');
    const shippingMethod = shippingSelect?.value || 
                          document.querySelector('input[name="shipping_method"]:checked')?.value || null;

    // Extract payment method
    const paymentSelect = document.querySelector('select[name="payment_method"], [data-payment-method]');
    const paymentInputs = document.querySelectorAll('input[name="payment_method"]:checked, [data-payment-type]');
    let paymentMethodType = null;
    if (paymentSelect) {
      paymentMethodType = paymentSelect.value;
    } else if (paymentInputs.length > 0) {
      paymentMethodType = paymentInputs[0].value || paymentInputs[0].dataset.paymentType;
    }
    
    // Detect payment method type from common patterns
    if (!paymentMethodType) {
      if (document.querySelector('[data-shop-pay]')) paymentMethodType = 'shop_pay';
      else if (document.querySelector('[data-apple-pay]')) paymentMethodType = 'apple_pay';
      else if (document.querySelector('[data-google-pay]')) paymentMethodType = 'google_pay';
      else if (document.querySelector('[data-paypal]')) paymentMethodType = 'paypal';
      else if (document.querySelector('input[type="card"], [data-card]')) paymentMethodType = 'card';
    }

    // Extract discount information
    const discountEl = document.querySelector('.discount, .discount-amount, [data-discount]');
    let discountAmount = null;
    let discountType = null;
    if (discountEl) {
      const discountText = discountEl.textContent;
      discountAmount = parseFloat(discountText.replace(/[^0-9.]/g, '')) || null;
      if (discountText.includes('%')) discountType = 'percentage';
      else if (discountAmount) discountType = 'fixed';
    }

    // Extract shipping cost
    const shippingCostEl = document.querySelector('.shipping-cost, [data-shipping-cost]');
    const shippingCost = shippingCostEl ? 
      parseFloat(shippingCostEl.textContent.replace(/[^0-9.]/g, '')) : null;

    trackEvent('checkout_start', {
      checkout_step: currentStep,
      cart_id: trackerState.cart.id,
      cart_total: trackerState.cart.total,
      cart_items: trackerState.cart.items,
      coupon_code: couponCode,
      discount_amount: discountAmount,
      discount_type: discountType,
      shipping_method: shippingMethod,
      shipping_cost: shippingCost,
      payment_method_type: paymentMethodType
    });

    // Monitor checkout step changes
    const checkoutObserver = new MutationObserver(() => {
      const newStep = Array.from(document.querySelectorAll('.step, .checkout-step, [data-step]'))
        .findIndex(step => step.classList.contains('active') || step.classList.contains('current'));
      if (newStep !== -1 && newStep + 1 !== trackerState.checkout.step) {
        trackerState.checkout.step = newStep + 1;
        trackEvent('checkout_step', {
          checkout_step: trackerState.checkout.step,
          cart_id: trackerState.cart.id
        });
      }
    });
    checkoutObserver.observe(document.body, { childList: true, subtree: true });

    // Monitor checkout completion
    checkForOrderCompletion(currentStep, shippingMethod, paymentMethodType, couponCode, shippingCost, discountAmount);
  }
  
  // ============================================================================
  // PURCHASE/ORDER TRACKING
  // ============================================================================
  
  function setupPurchaseTracking() {
    debugLog('Order confirmation page detected - tracking purchase', {}, 'event');
    
    // Extract order ID from various sources
    const orderId = extractOrderId();
    
    if (!orderId) {
      debugLog('Order ID not found, will retry...', {}, 'warning');
      // Retry after page loads fully
      setTimeout(() => {
        const retryOrderId = extractOrderId();
        if (retryOrderId) {
          trackPurchaseEvent(retryOrderId);
        } else {
          // Use MutationObserver to watch for order details appearing
          const observer = new MutationObserver(() => {
            const detectedOrderId = extractOrderId();
            if (detectedOrderId) {
              trackPurchaseEvent(detectedOrderId);
              observer.disconnect();
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
          
          // Stop after 10 seconds
          setTimeout(() => observer.disconnect(), 10000);
        }
      }, 2000);
      return;
    }
    
    trackPurchaseEvent(orderId);
  }
  
  function extractOrderId() {
    // Try URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    let orderId = urlParams.get('order') || urlParams.get('order_id') || urlParams.get('checkout_id');
    
    // Try URL path
    if (!orderId) {
      const pathMatch = window.location.pathname.match(/\/orders\/([^\/\?#]+)/);
      if (pathMatch) orderId = pathMatch[1];
    }
    
    // Try meta tags
    if (!orderId) {
      const metaOrder = document.querySelector('meta[name="order-number"], meta[property="order:number"], meta[name="order_id"]');
      if (metaOrder) orderId = metaOrder.content;
    }
    
    // Try data attributes
    if (!orderId) {
      const orderEl = document.querySelector('[data-order-id], [data-order-number], .order-number, .order-id');
      if (orderEl) {
        orderId = orderEl.dataset.orderId || 
                 orderEl.dataset.orderNumber || 
                 orderEl.textContent.match(/#?(\d+)/)?.[1];
      }
    }
    
    // Try hidden inputs
    if (!orderId) {
      const orderInput = document.querySelector('input[name="order_id"], input[name="order-number"], input[name="order_id"]');
      if (orderInput) orderId = orderInput.value;
    }
    
    // Try Shopify object
    if (!orderId && window.Shopify && window.Shopify.checkout) {
      orderId = window.Shopify.checkout.order_id || window.Shopify.checkout.orderNumber;
    }
    
    // Try text content patterns
    if (!orderId) {
      const orderTextElements = document.querySelectorAll('.order-number, .order-id, .order-confirmation-number, [class*="order"], [id*="order"]');
      for (const el of orderTextElements) {
        const text = el.textContent || '';
        const match = text.match(/order[#:\s]+([A-Z0-9]+)/i) || text.match(/#(\d{4,})/);
        if (match && match[1]) {
          orderId = match[1];
          break;
        }
      }
    }
    
    return orderId;
  }
  
  function trackPurchaseEvent(orderId) {
    if (!orderId) {
      debugLog('Cannot track purchase - no order ID found', {}, 'error');
      return;
    }
    
    // Check if we've already tracked this order (avoid duplicates)
    try {
      const trackedOrders = JSON.parse(localStorage.getItem('tracker_tracked_orders') || '[]');
      if (trackedOrders.includes(orderId.toString())) {
        debugLog('Purchase already tracked for order: ' + orderId, {}, 'event');
        return;
      }
    } catch (e) {
      // localStorage unavailable, continue anyway
    }
    
    debugLog('Tracking purchase for order: ' + orderId, {}, 'event');
    
    // Extract order details
    const orderTotalEl = document.querySelector('.order-total, [data-order-total], .total-price, .order-summary-total');
    let orderTotal = null;
    if (orderTotalEl) {
      const totalText = orderTotalEl.textContent.replace(/[^0-9.]/g, '');
      orderTotal = parseFloat(totalText) || null;
    }
    
    const orderShippingEl = document.querySelector('.order-shipping, [data-shipping-total], .shipping-total');
    let orderShippingTotal = null;
    if (orderShippingEl) {
      const shippingText = orderShippingEl.textContent.replace(/[^0-9.]/g, '');
      orderShippingTotal = parseFloat(shippingText) || null;
    }
    
    const orderDiscountEl = document.querySelector('.order-discount, [data-discount-total], .discount-total, .savings');
    let orderDiscountTotal = null;
    if (orderDiscountEl) {
      const discountText = orderDiscountEl.textContent.replace(/[^0-9.]/g, '');
      orderDiscountTotal = parseFloat(discountText) || null;
    }
    
    // Extract order items
    const orderItems = [];
    const itemElements = document.querySelectorAll('.order-item, .order-line-item, [data-order-item], .product-item');
    itemElements.forEach(item => {
      const productId = item.dataset.productId || item.querySelector('[data-product-id]')?.dataset.productId;
      const variantId = item.dataset.variantId || item.querySelector('[data-variant-id]')?.dataset.variantId;
      const title = item.querySelector('.product-title, .item-title, h3, h4')?.textContent.trim();
      const quantityEl = item.querySelector('.quantity, [data-quantity]');
      const quantity = quantityEl ? parseInt(quantityEl.textContent || quantityEl.value || '1') : 1;
      const priceEl = item.querySelector('.price, .item-price, [data-price]');
      const price = priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) : null;
      
      if (productId || title) {
        orderItems.push({
          product_id: productId,
          variant_id: variantId,
          title: title,
          quantity: quantity,
          price: price,
          currency: 'USD'
        });
      }
    });
    
    // Get payment method if available
    let paymentMethodType = document.querySelector('[data-payment-method]')?.dataset.paymentMethod ||
                           document.querySelector('.payment-method')?.textContent.trim() ||
                           null;
    
    // Get shipping method if available
    let shippingMethod = document.querySelector('[data-shipping-method]')?.dataset.shippingMethod ||
                        document.querySelector('.shipping-method')?.textContent.trim() ||
                        null;
    
    // Get coupon code if available
    let couponCode = document.querySelector('[data-coupon-code]')?.dataset.couponCode ||
                    document.querySelector('.coupon-code, .discount-code')?.textContent.trim() ||
                    null;
    
    // Track the purchase event
    trackEvent('purchase', {
      order_id: orderId.toString(),
      checkout_completed: true,
      order_total: orderTotal || trackerState.cart.total || null,
      order_items: orderItems.length > 0 ? orderItems : trackerState.cart.items || [],
      order_discount_total: orderDiscountTotal || null,
      order_shipping_total: orderShippingTotal || null,
      cart_id: trackerState.cart.id || null,
      coupon_code: couponCode || null,
      shipping_method: shippingMethod || null,
      payment_method_type: paymentMethodType || null
    });
    
    // Mark this order as tracked
    try {
      const trackedOrders = JSON.parse(localStorage.getItem('tracker_tracked_orders') || '[]');
      trackedOrders.push(orderId.toString());
      localStorage.setItem('tracker_tracked_orders', JSON.stringify(trackedOrders.slice(-50))); // Keep last 50
    } catch (e) {
      // localStorage unavailable
    }
  }
  
  function checkForOrderCompletion(currentStep, shippingMethod, paymentMethodType, couponCode, shippingCost, discountAmount) {
    const orderCompleteIndicator = document.querySelector('.order-status, .order-confirmation, [data-order-id], .thank-you');
    if (orderCompleteIndicator) {
      const orderId = extractOrderId();
      
      if (orderId) {
        trackPurchaseEvent(orderId);
        return;
      }
    }
    
    // Also check periodically for order completion (in case it appears after page load)
    const completionObserver = new MutationObserver(() => {
      const detectedOrderId = extractOrderId();
      if (detectedOrderId) {
        trackPurchaseEvent(detectedOrderId);
        completionObserver.disconnect();
      }
    });
    completionObserver.observe(document.body, { childList: true, subtree: true });
    
    // Stop after 30 seconds
    setTimeout(() => completionObserver.disconnect(), 30000);
  }

  // ============================================================================
  // SEARCH TRACKING
  // ============================================================================

  function setupSearchTracking() {
    if (trackerState.currentPage.type !== 'search') return;

    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q') || urlParams.get('query');
    
    if (query) {
      trackerState.search.query = query;
      
      // Get results count
      const resultsText = document.querySelector('.search-results-count, .results-count')?.textContent;
      const resultsMatch = resultsText?.match(/(\d+)/);
      trackerState.search.resultsCount = resultsMatch ? parseInt(resultsMatch[1]) : null;

      // Get filters
      const activeFilters = {};
      document.querySelectorAll('.filter-active, [data-filter]').forEach(filter => {
        const key = filter.dataset.filter || filter.className;
        activeFilters[key] = filter.textContent.trim();
      });
      trackerState.search.filters = activeFilters;

      // Get sort
      const sortSelect = document.querySelector('select[name="sort_by"], [data-sort]');
      trackerState.search.sortBy = sortSelect?.value || null;

      trackEvent('search', {
        search_query: query,
        search_results_count: trackerState.search.resultsCount,
        filters: trackerState.search.filters,
        sort_by: trackerState.search.sortBy,
        page_number: trackerState.search.pageNumber
      });
    }
  }

  // ============================================================================
  // ENGAGEMENT TRACKING
  // ============================================================================

  function setupScrollTracking() {
    let lastLoggedDepth = 0;
    let scrollTimeout;

    window.addEventListener('scroll', function() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const scrollPercentage = Math.round(
          (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
        );

        if (scrollPercentage > trackerState.engagement.scrollDepth) {
          trackerState.engagement.scrollDepth = scrollPercentage;
          
          // Log at milestones
          if (scrollPercentage >= lastLoggedDepth + 25 || scrollPercentage === 100) {
            trackEvent('scroll', {
              scroll_depth_percent: scrollPercentage,
              page_type: trackerState.currentPage.type
            });
            lastLoggedDepth = scrollPercentage;
          }
        }
      }, 200);
    }, { passive: true });
  }

  function setupTimeTracking() {
    let timeInterval = setInterval(() => {
      if (document.hidden) return;
      
      const timeSpent = Math.round((new Date() - trackerState.pageStartTime) / 1000);
      trackerState.engagement.timeOnPage = timeSpent;
      
      // Log every 30 seconds
      if (timeSpent % 30 === 0 && timeSpent > 0) {
        trackEvent('time_on_page', {
          time_on_page: timeSpent,
          page_type: trackerState.currentPage.type
        });
      }
    }, 10000);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearInterval(timeInterval);
      } else {
        trackerState.pageStartTime = new Date();
        timeInterval = setInterval(() => {
          if (document.hidden) return;
          const timeSpent = Math.round((new Date() - trackerState.pageStartTime) / 1000);
          trackerState.engagement.timeOnPage = timeSpent;
        }, 10000);
      }
    });
  }

  function setupClickTracking() {
    document.addEventListener('click', function(e) {
      const target = e.target.closest('a, button, [data-click], [data-track]');
      if (!target) return;

      trackEvent('click', {
        click_target: target.id || target.className || target.tagName,
        element_id: target.id,
        element_class: target.className,
        element_text: target.textContent.trim().substring(0, 100),
        href: target.href || null,
        page_type: trackerState.currentPage.type
      });
    }, { passive: true });
  }

  function setupHoverTracking() {
    const productImages = document.querySelectorAll('.product-image, .product__image, img[data-product-id]');
    
    productImages.forEach(img => {
      let hoverStartTime = null;
      
      img.addEventListener('mouseenter', () => {
        hoverStartTime = Date.now();
      });
      
      img.addEventListener('mouseleave', () => {
        if (hoverStartTime) {
          const hoverTime = Date.now() - hoverStartTime;
          if (hoverTime > 500) { // Only track hovers > 500ms
            const productId = img.dataset.productId || 
                            img.closest('[data-product-id]')?.dataset.productId;
            trackEvent('hover', {
              hover_time: hoverTime,
              product_id: productId,
              element_type: 'product_image'
            });
          }
          hoverStartTime = null;
        }
      });
    });
  }

  function setupVideoTracking() {
    const videos = document.querySelectorAll('video, [data-video]');
    
    videos.forEach(video => {
      video.addEventListener('play', () => {
        trackEvent('video_play', {
          video_url: video.src || video.currentSrc,
          page_type: trackerState.currentPage.type
        });
      });
    });
  }

  function setupWishlistTracking() {
    document.body.addEventListener('click', function(e) {
      const wishlistBtn = e.target.closest('.wishlist, .favorite, [data-wishlist], [data-favorite]');
      if (!wishlistBtn) return;

      const productElement = wishlistBtn.closest('[data-product-id], .product');
      (async () => {
        const productData = await extractProductData(productElement || document.body);
        trackEvent('add_to_wishlist', {
          product_id: productData.product_id,
          variant_id: productData.variant_id,
          title: productData.title
        });
      })();
    });
  }

  function setupImageZoomTracking() {
    const zoomTriggers = document.querySelectorAll('.product-image, .zoom-trigger, [data-zoom]');
    
    zoomTriggers.forEach(trigger => {
      trigger.addEventListener('click', function() {
        if (this.classList.contains('zoomed') || this.dataset.zoomed === 'true') {
          const productId = this.dataset.productId || 
                          this.closest('[data-product-id]')?.dataset.productId;
          trackEvent('product_image_zoom', {
            product_id: productId,
            zoomed: true
          });
        }
      });
    });
  }

  function setupSizeChartTracking() {
    document.body.addEventListener('click', function(e) {
      const sizeChartBtn = e.target.closest('.size-chart, [data-size-chart], .size-guide, [data-size-guide]');
      if (!sizeChartBtn) return;

      const productElement = sizeChartBtn.closest('[data-product-id], .product');
      (async () => {
        const productData = await extractProductData(productElement || document.body);
        trackEvent('size_chart_view', {
          product_id: productData.product_id,
          variant_id: productData.variant_id
        });
      })();
    });
  }

  function setupReviewTracking() {
    document.body.addEventListener('click', function(e) {
      const reviewBtn = e.target.closest('.review-link, [data-review], .product-reviews, [data-reviews]');
      if (!reviewBtn) return;

      const productElement = reviewBtn.closest('[data-product-id], .product');
      (async () => {
        const productData = await extractProductData(productElement || document.body);
        trackEvent('review_click', {
          product_id: productData.product_id,
          variant_id: productData.variant_id
        });
      })();
    });
  }

  function setupChatTracking() {
    // Track chat widget interactions
    const chatWidgets = document.querySelectorAll('.chat-widget, [data-chat], .live-chat, iframe[src*="chat"]');
    
    chatWidgets.forEach(widget => {
      widget.addEventListener('click', () => {
        trackEvent('chat_interaction', {
          chat_type: widget.dataset.chat || 'live_chat',
          page_type: trackerState.currentPage.type
        });
      });
    });

    // Listen for chat messages (if chat widget exposes events)
    window.addEventListener('chatMessage', (e) => {
      trackEvent('chat_interaction', {
        chat_type: 'message_sent',
        page_type: trackerState.currentPage.type
      });
    });
  }

  function setup3DViewTracking() {
    document.body.addEventListener('click', function(e) {
      const view3DBtn = e.target.closest('[data-3d], .view-3d, [data-ar], .ar-view');
      if (!view3DBtn) return;

      const productElement = view3DBtn.closest('[data-product-id], .product');
      (async () => {
        const productData = await extractProductData(productElement || document.body);
        trackEvent('3d_view_opened', {
          product_id: productData.product_id,
          variant_id: productData.variant_id,
          view_type: view3DBtn.dataset.ar ? 'ar' : '3d'
        });
      })();
    });
  }

  function setupReturnTracking() {
    // Track return initiation
    const returnForm = document.querySelector('form[action*="/returns"], form[action*="/account/returns"]');
    if (returnForm) {
      returnForm.addEventListener('submit', () => {
        const orderId = returnForm.querySelector('[name="order_id"]')?.value ||
                       document.querySelector('[data-order-id]')?.dataset.orderId;
        const returnReason = returnForm.querySelector('[name="reason"], select[name="return_reason"]')?.value ||
                            returnForm.querySelector('textarea[name="reason"]')?.value;

        trackEvent('return_initiated', {
          order_id: orderId,
          return_reason: returnReason,
          page_type: trackerState.currentPage.type
        });
      });
    }
  }

  // ============================================================================
  // LIFECYCLE & IDENTITY TRACKING
  // ============================================================================

  function setupIdentityTracking() {
    // Track login
    const loginForm = document.querySelector('form[action*="/account/login"]');
    if (loginForm) {
      loginForm.addEventListener('submit', () => {
        trackEvent('customer_logged_in', {
          page_type: trackerState.currentPage.type
        });
      });
    }

    // Track signup
    const signupForm = document.querySelector('form[action*="/account/register"], form[action*="/account"]');
    if (signupForm && signupForm.querySelector('input[name="customer[email]"]')) {
      signupForm.addEventListener('submit', () => {
        trackEvent('customer_created', {
          page_type: trackerState.currentPage.type
        });
      });
    }

    // Track logout (if logout link exists)
    const logoutLink = document.querySelector('a[href*="/account/logout"]');
    if (logoutLink) {
      logoutLink.addEventListener('click', () => {
        trackEvent('customer_logged_out', {});
      });
    }

    // Track address added
    const addressForm = document.querySelector('form[action*="/account/addresses"]');
    if (addressForm) {
      addressForm.addEventListener('submit', () => {
        const isNew = !addressForm.querySelector('input[name="address[id]"]')?.value;
        if (isNew) {
          trackEvent('address_added', {
            page_type: trackerState.currentPage.type
          });
        }
      });
    }

    // Track subscription events (if subscription app is present)
    const subscriptionStartBtn = document.querySelector('[data-subscribe], .subscribe-button, [data-recharge-subscribe]');
    if (subscriptionStartBtn) {
      subscriptionStartBtn.addEventListener('click', () => {
        trackEvent('subscription_started', {
          page_type: trackerState.currentPage.type
        });
      });
    }

    const subscriptionCancelBtn = document.querySelector('[data-cancel-subscription], .cancel-subscription');
    if (subscriptionCancelBtn) {
      subscriptionCancelBtn.addEventListener('click', () => {
        trackEvent('subscription_cancelled', {
          page_type: trackerState.currentPage.type
        });
      });
    }
  }

  // ============================================================================
  // PERFORMANCE TRACKING
  // ============================================================================

  function trackPerformance() {
    // Page load time
    if (window.performance && window.performance.timing) {
      const perf = window.performance.timing;
      
      // Validate and calculate load time (must be positive and reasonable)
      const loadTime = perf.loadEventEnd > 0 && perf.navigationStart > 0 
        ? Math.max(0, perf.loadEventEnd - perf.navigationStart)
        : null;
      
      // Only set if valid (positive and less than 5 minutes - reasonable max)
      if (loadTime !== null && loadTime > 0 && loadTime < 300000) {
        trackerState.performance.pageLoadTime = loadTime;
        
        const domContentLoaded = perf.domContentLoadedEventEnd > 0 && perf.navigationStart > 0
          ? Math.max(0, perf.domContentLoadedEventEnd - perf.navigationStart)
          : null;
        const domInteractive = perf.domInteractive > 0 && perf.navigationStart > 0
          ? Math.max(0, perf.domInteractive - perf.navigationStart)
          : null;
        
        trackEvent('page_load', {
          page_load_time_ms: loadTime,
          dom_content_loaded: domContentLoaded,
          dom_interactive: domInteractive
        });
      }
    }

    // Resource timing
    if (window.performance && window.performance.getEntriesByType) {
      const resources = window.performance.getEntriesByType('resource');
      resources.forEach(resource => {
        if (resource.name.includes('/api/') || resource.name.includes('/cart')) {
          trackerState.performance.apiResponseTimes.push({
            url: resource.name,
            duration: resource.duration,
            timestamp: Date.now()
          });
        }
      });
    }

    // JavaScript errors
    window.addEventListener('error', (e) => {
      trackEvent('js_error', {
        error_message: e.message,
        error_source: e.filename,
        error_line: e.lineno,
        error_column: e.colno,
        error_stack: e.error?.stack?.substring(0, 500) || null
      });
    }, true);

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (e) => {
      trackEvent('js_error', {
        error_message: e.reason?.message || 'Unhandled Promise Rejection',
        error_type: 'promise_rejection',
        error_stack: e.reason?.stack?.substring(0, 500) || null
      });
    });
  }

  // ============================================================================
  // DATA SENDING
  // ============================================================================

  function sendEvent(event) {
    if (!navigator.onLine) {
      // Store offline
      try {
        const pending = JSON.parse(localStorage.getItem('tracker_pending_events') || '[]');
        pending.push(event);
        localStorage.setItem('tracker_pending_events', JSON.stringify(pending));
      } catch (e) {
        // localStorage unavailable, can't queue offline events
        debugLog('Cannot queue offline event - storage unavailable', e, 'warning');
      }
      return;
    }

    const payload = JSON.stringify(event);
    
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(config.apiEndpoint, blob);
    } else {
      fetch(config.apiEndpoint, {
        method: 'POST',
        body: payload,
        keepalive: true,
        headers: { 'Content-Type': 'application/json' }
      }).catch(err => {
        debugLog('Error sending event', err, 'error');
        // Store for retry
        try {
          const pending = JSON.parse(localStorage.getItem('tracker_pending_events') || '[]');
          pending.push(event);
          localStorage.setItem('tracker_pending_events', JSON.stringify(pending));
        } catch (e) {
          // localStorage unavailable, can't queue for retry
          debugLog('Cannot queue event for retry - storage unavailable', e, 'warning');
        }
      });
    }
  }

  function sendBatchEvents() {
    if (trackerState.events.length === 0) return;
    
    const batch = trackerState.events.splice(0, config.batchSize);
    const payload = JSON.stringify({ events: batch });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(config.apiEndpoint, blob);
    } else {
      fetch(config.apiEndpoint, {
        method: 'POST',
        body: payload,
        keepalive: true,
        headers: { 'Content-Type': 'application/json' }
      }).catch(err => {
        debugLog('Error sending batch', err, 'error');
        // Re-add to queue
        trackerState.events.unshift(...batch);
      });
    }
  }

  function sendPendingEvents() {
    try {
      const pending = JSON.parse(localStorage.getItem('tracker_pending_events') || '[]');
      if (pending.length === 0) return;

      const payload = JSON.stringify({ events: pending });
      
      fetch(config.apiEndpoint, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' }
      }).then(() => {
        try {
          localStorage.removeItem('tracker_pending_events');
        } catch (e) {
          // localStorage unavailable
        }
        debugLog(`📡 Sent ${pending.length} pending events`);
      }).catch(err => {
        debugLog('Error sending pending events', err, 'error');
      });
    } catch (e) {
      // localStorage unavailable
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function initTracker() {
    debugLog('🚀 Advanced Tracker Initialized', {
      sessionId: trackerState.sessionId,
      anonymousId: trackerState.anonymousId,
      userId: trackerState.hashedUserId,
      storeId: trackerState.storeId,
      pageType: trackerState.currentPage.type
    });

    // Core tracking
    if (config.trackPageViews) {
      trackPageView();
      setupProductViewTracking();
    }

    if (config.trackProducts) {
      setupProductImpressionTracking();
    }

    if (config.trackCartActions) {
      setupCartTracking();
    }

    if (config.trackSearch) {
      setupSearchTracking();
    }

    setupCheckoutTracking();
    setupIdentityTracking();

    // Engagement tracking
    if (config.trackEngagement) {
      if (config.trackScrollDepth) setupScrollTracking();
      if (config.trackTimeOnPage) setupTimeTracking();
      if (config.trackClicks) setupClickTracking();
      setupHoverTracking();
      setupVideoTracking();
      setupWishlistTracking();
      setupImageZoomTracking();
      setupSizeChartTracking();
      setupReviewTracking();
      setupChatTracking();
      setup3DViewTracking();
    }

    setupReturnTracking();

    // Performance tracking
    if (config.trackPerformance) {
      trackPerformance();
    }

    // Watch for DOM changes (Shopify AJAX)
    const domObserver = new MutationObserver(() => {
      setupProductImpressionTracking();
      setupSearchTracking();
      setupCheckoutTracking();
    });
    domObserver.observe(document.body, { childList: true, subtree: true });

    // Send pending events on load
    if (navigator.onLine) {
      sendPendingEvents();
    }

    // Handle online/offline
    window.addEventListener('online', sendPendingEvents);
    window.addEventListener('offline', () => {
      debugLog('⚠️ Offline - events will be queued', {}, 'warning');
    });

    // Send final session data on unload
    window.addEventListener('beforeunload', () => {
      // Send remaining events first
      if (trackerState.events.length > 0) {
        sendBatchEvents();
      }
      
      // Track cart abandonment (only once, only if cart has items)
      if (!trackerState.flags.cartAbandonSent && trackerState.cart.itemCount > 0) {
        trackerState.flags.cartAbandonSent = true;
        const abandonEvent = createEvent('cart_abandon', {
          cart_id: trackerState.cart.id,
          cart_total: trackerState.cart.total,
          cart_items: trackerState.cart.items,
          cart_item_count: trackerState.cart.itemCount
        });
        sendEvent(abandonEvent); // Send immediately via sendBeacon
      }
      
      // Track session end (only once)
      if (!trackerState.flags.sessionEndSent) {
        trackerState.flags.sessionEndSent = true;
        const sessionDuration = Math.round((new Date() - trackerState.sessionStartTime) / 1000);
        const sessionEndEvent = createEvent('session_end', {
          session_length_seconds: sessionDuration,
          pages_per_session: trackerState.events.filter(e => e.event_type === 'page_view').length,
          events_per_session: trackerState.events.length
        });
        sendEvent(sessionEndEvent); // Send immediately via sendBeacon
      }
    });
  }

  // ============================================================================
  // DEBUG LOGGING
  // ============================================================================

  function debugLog(message, data, type = 'log') {
    if (!config.debugMode) return;
    const styles = {
      log: 'color: #2196F3;',
      event: 'color: #4CAF50;',
      warning: 'color: #FF9800;',
      error: 'color: #F44336;'
    };
    console.log(`%c[Tracker] ${message}`, styles[type] || styles.log);
    if (data && Object.keys(data).length > 0) {
      console.table(data);
    }
  }

  // ============================================================================
  // EXPOSE API (Optional - for manual tracking)
  // ============================================================================

  window.ShopifyTracker = {
    track: trackEvent,
    getState: () => ({ ...trackerState }),
    getCart: fetchCartData,
    setConsent: (consent) => {
      try {
        localStorage.setItem('tracker_consent', JSON.stringify(consent));
      } catch (e) {
        debugLog('Cannot save consent - storage unavailable', e, 'warning');
        // Store in memory as fallback
        window._trackerConsent = consent;
      }
    }
  };

  // ============================================================================
  // START TRACKER
  // ============================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTracker);
  } else {
    initTracker();
  }

})();
