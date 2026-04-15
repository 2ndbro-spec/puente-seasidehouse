/* ============================================
   PUENTE seaside house — Main JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // --- Hamburger Menu ---
  const hamburger = document.querySelector('.hamburger');
  const nav = document.querySelector('.nav');

  if (hamburger && nav) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      nav.classList.toggle('active');
    });

    // Close menu on link click
    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        nav.classList.remove('active');
      });
    });
  }

  // --- Header scroll effect ---
  const header = document.querySelector('.header');
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });
  }

  // --- Lazy Load Images ---
  const lazyImages = document.querySelectorAll('img[data-src]');
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      });
    });

    lazyImages.forEach(img => imageObserver.observe(img));
  } else {
    lazyImages.forEach(img => {
      img.src = img.dataset.src;
    });
  }

  // --- Scroll Reveal Animation (staggered) ---
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length > 0) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Stagger siblings inside the same parent
          const parent = entry.target.parentElement;
          const siblings = Array.from(parent.querySelectorAll('.reveal'));
          const index = siblings.indexOf(entry.target);
          const delay = index * 120;
          entry.target.style.transitionDelay = delay + 'ms';
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    reveals.forEach(el => revealObserver.observe(el));
  }
});
