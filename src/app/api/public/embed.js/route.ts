import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const cors = {
  'Content-Type': 'application/javascript; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=120',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: cors });
}

export async function GET(req: NextRequest) {
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const host = req.headers.get('host') || 'localhost:3000';
  const baseUrl = `${proto}://${host}`;

  const js = `
(function() {
  if (window.__gp_embed_loaded) return;
  window.__gp_embed_loaded = true;

  var API_BASE = '${baseUrl}';

  function getShop() {
    return (window.Shopify && window.Shopify.shop) || location.hostname;
  }

  function getProductId() {
    if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
      return String(window.ShopifyAnalytics.meta.product.id);
    }
    if (window.meta && window.meta.product && window.meta.product.id) {
      return String(window.meta.product.id);
    }
    var hiddenId = document.querySelector('form[action*="/cart/add"] input[name="product-id"], [data-product-id]');
    if (hiddenId && hiddenId.value) return hiddenId.value;
    if (hiddenId && hiddenId.getAttribute('data-product-id')) return hiddenId.getAttribute('data-product-id');
    return null;
  }

  function fmt(n, cur) {
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: cur || 'INR',
        maximumFractionDigits: 2
      }).format(n);
    } catch(e) {
      return (cur || '₹') + ' ' + Number(n).toFixed(2);
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function injectStyles() {
    if (document.getElementById('gp-embed-styles')) return;
    var style = document.createElement('style');
    style.id = 'gp-embed-styles';
    style.textContent = [
      '.gp-embed-container { margin: 18px 0 16px; font-family: inherit; font-size: 13px; color: #1a1a1a; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; clear: both !important; display: block !important; flex: 0 0 100% !important; }',
      '.gp-embed-container * { box-sizing: border-box; }',
      '.gp-embed-breakup { width: 100% !important; border: 1px solid #e3e3e3; border-radius: 9px; overflow: hidden; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }',
      '.gp-embed-toggle { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 11px 14px; background: #fafafa; border: 0; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; color: #1a1a1a; transition: background 0.15s; }',
      '.gp-embed-toggle:hover { background: #f4f4f4; }',
      '.gp-embed-toggle.open { border-bottom: 1px solid #eee; background: #f7f7f7; }',
      '.gp-embed-box { padding: 12px 14px; background: #fff; }',
      '.gp-embed-pill { padding: 7px 11px; background: #fdf6e3; color: #7a5200; border: 1px solid #faecc5; border-radius: 6px; margin-bottom: 10px; font-size: 12.5px; line-height: 1.4; }',
      '.gp-embed-table { width: 100%; border-collapse: collapse; font-size: 13px; }',
      '.gp-embed-table td { padding: 6px 0; border-bottom: 1px dashed #eee; color: #333; }',
      '.gp-embed-table .gp-amt { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; padding-left: 10px; }',
      '.gp-embed-table .gp-detail { color: #777; font-size: 12px; margin-left: 4px; }',
      '.gp-embed-total td { font-weight: 700; font-size: 14px; border-top: 1px solid #ddd; color: #111; padding-top: 10px; border-bottom: 0; }',
      '.gp-embed-note { font-size: 11px; color: #888; margin-top: 8px; text-align: right; }'
    ].join('\\n');
    document.head.appendChild(style);
  }

  function findTargetElement() {
    // 1. Explicit placeholder if added anywhere via Shopify Customizer (Drag & Drop Block)
    var explicit = document.getElementById('gold-price-breakup') ||
                   document.querySelector('[data-gp-target], .gold-price-breakup, .gold-rate-pricer-widget, [data-gold-price-breakup]');
    if (explicit) return { el: explicit, pos: 'inside' };

    // 2. Directly AFTER the "Buy It Now" / Dynamic Checkout button
    var paymentBtn = document.querySelector('[data-shopify="payment-button"], .shopify-payment-button, .shopify-payment-button__button');
    if (paymentBtn && paymentBtn.parentNode) {
      var topPayment = paymentBtn.closest('.shopify-payment-button') || paymentBtn;
      if (topPayment && topPayment.parentNode) {
        return { el: topPayment, pos: 'after' };
      }
    }

    // 3. Directly AFTER .product-form__buttons (Add to Cart + Buy It Now group)
    var buyButtons = document.querySelector('.product-form__buttons, .product-form__payment-container');
    if (buyButtons && buyButtons.parentNode) {
      return { el: buyButtons, pos: 'after' };
    }

    // 4. Directly AFTER <product-form> or form[action*="/cart/add"]
    var productForm = document.querySelector('product-form, form[action*="/cart/add"], .product__form');
    if (productForm && productForm.parentNode) {
      return { el: productForm, pos: 'after' };
    }

    // 5. Directly BEFORE Share / Wishlist / Trust Badges block
    var shareBlock = document.querySelector('.product__share, [class*="share"], [class*="wishlist"], .product-form__social');
    if (shareBlock && shareBlock.parentNode) {
      return { el: shareBlock, pos: 'before' };
    }

    return null;
  }

  function init() {
    var shop = getShop();
    var productId = getProductId();

    if (!productId) {
      var pathParts = location.pathname.split('/');
      var pIdx = pathParts.indexOf('products');
      if (pIdx !== -1 && pathParts[pIdx + 1]) {
        var handle = pathParts[pIdx + 1].split('?')[0];
        fetch('/products/' + handle + '.js')
          .then(function(r) { return r.json(); })
          .then(function(prod) { if (prod && prod.id) loadBreakup(shop, String(prod.id)); })
          .catch(function() {});
        return;
      }
      return;
    }

    loadBreakup(shop, productId);
  }

  function loadBreakup(shop, productId) {
    fetch(API_BASE + '/api/public/breakup?shop=' + encodeURIComponent(shop) + '&product=' + encodeURIComponent(productId))
      .then(function(r) { return r.json(); })
      .then(function(res) {
        if (!res || !res.variants || Object.keys(res.variants).length === 0) return;
        renderWidget(res.variants);
      })
      .catch(function(err) {
        console.warn('[Gold Rate Pricer]', err);
      });
  }

  function renderWidget(variants) {
    injectStyles();

    var targetObj = findTargetElement();
    if (!targetObj) return;

    var container = document.getElementById('gp-embed-widget');
    if (!container) {
      container = document.createElement('div');
      container.id = 'gp-embed-widget';
      container.className = 'gp-embed-container';
    }

    if (targetObj.pos === 'inside') {
      if (container.parentNode !== targetObj.el) targetObj.el.appendChild(container);
    } else if (targetObj.pos === 'before' && (container.nextSibling !== targetObj.el || container.parentNode !== targetObj.el.parentNode)) {
      targetObj.el.parentNode.insertBefore(container, targetObj.el);
    } else if (targetObj.pos === 'after' && (container.previousSibling !== targetObj.el || container.parentNode !== targetObj.el.parentNode)) {
      targetObj.el.parentNode.insertBefore(container, targetObj.el.nextSibling);
    }

    container.innerHTML = [
      '<div class="gp-embed-breakup">',
      '  <button type="button" class="gp-embed-toggle open">',
      '    <span><span style="color:#b8860b">✨</span> Price Breakup & Metal Details</span>',
      '    <span class="gp-arrow">▴</span>',
      '  </button>',
      '  <div class="gp-embed-box">',
      '    <div class="gp-embed-pill" data-gp-meta></div>',
      '    <table class="gp-embed-table"><tbody data-gp-rows></tbody></table>',
      '    <div class="gp-embed-note">Dynamically calculated using live certified metal rates.</div>',
      '  </div>',
      '</div>'
    ].join('');

    var wrap = container.querySelector('.gp-embed-breakup');
    var btn = wrap.querySelector('.gp-embed-toggle');
    var box = wrap.querySelector('.gp-embed-box');
    var meta = wrap.querySelector('[data-gp-meta]');
    var rows = wrap.querySelector('[data-gp-rows]');

    btn.addEventListener('click', function() {
      var isHidden = box.hidden;
      box.hidden = !isHidden;
      btn.classList.toggle('open', isHidden);
      btn.querySelector('.gp-arrow').textContent = isHidden ? '▴' : '▾';
    });

    var lastId = null;

    function update(id) {
      id = String(id || '').trim();
      if (id === lastId) return;
      lastId = id;

      var b = variants[id];
      if (!b) {
        var keys = Object.keys(variants);
        for (var i = 0; i < keys.length; i++) {
          if (keys[i].endsWith(id) || id.endsWith(keys[i])) {
            b = variants[keys[i]];
            break;
          }
        }
        if (!b && keys.length > 0) b = variants[keys[0]];
      }

      if (!b) {
        container.style.display = 'none';
        return;
      }
      container.style.display = '';

      if (meta) {
        meta.innerHTML = '<strong>' + esc(b.metal || 'Gold') + '</strong>' +
          (b.weight ? ' &bull; Net Weight: <strong>' + esc(b.weight) + ' g</strong>' : '') +
          (b.rate_per_gram ? ' &bull; Rate Today: <strong>' + fmt(b.rate_per_gram, b.currency) + '/g</strong>' : '');
      }

      var html = '';
      (b.lines || []).forEach(function(l) {
        html += '<tr><td>' + esc(l.label) +
          (l.detail ? '<span class="gp-detail">(' + esc(l.detail) + ')</span>' : '') +
          '</td><td class="gp-amt">' + fmt(l.amount, b.currency) + '</td></tr>';
      });
      html += '<tr class="gp-embed-total"><td>Total Price (incl. GST)</td><td class="gp-amt">' + fmt(b.total, b.currency) + '</td></tr>';
      rows.innerHTML = html;
    }

    function getCurrentVariantId() {
      var urlParam = new URLSearchParams(location.search).get('variant');
      if (urlParam && variants[urlParam]) return urlParam;

      var input = document.querySelector('form[action*="/cart/add"] [name="id"], select[name="id"]');
      if (input && input.value) return input.value;

      var checkedRadio = document.querySelector('input[name="id"]:checked');
      if (checkedRadio && checkedRadio.value) return checkedRadio.value;

      var keys = Object.keys(variants);
      return keys[0] || '';
    }

    update(getCurrentVariantId());

    // Listen to standard Shopify variant changes
    document.addEventListener('variant:change', function(e) {
      if (e.detail && e.detail.variant && e.detail.variant.id) {
        update(e.detail.variant.id);
      } else {
        update(getCurrentVariantId());
      }
    });

    // Listen to option clicks (pills, dropdowns, swatches)
    document.addEventListener('change', function() {
      setTimeout(function() { update(getCurrentVariantId()); }, 40);
    });

    // Watch URL popstate
    window.addEventListener('popstate', function() {
      update(getCurrentVariantId());
    });

    // Polling fallback
    setInterval(function() {
      update(getCurrentVariantId());
    }, 450);
  }

  // Support Shopify Theme Customizer Live Preview & Drag-and-Drop
  document.addEventListener('shopify:section:load', init);
  document.addEventListener('shopify:block:select', init);
  document.addEventListener('shopify:section:select', init);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
  `;

  return new NextResponse(js, { headers: cors });
}
