// Razorpay sends the Android app's checkout tab here (DECISIONS D-052). This page grants
// nothing: it only hands the order id back to the app, which asks the server what happened.
(function () {
  var order = new URLSearchParams(window.location.search).get('order') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(order)) return;
  var target = 'com.soul.srm://pay/return?order=' + order;
  document.getElementById('back').setAttribute('href', target);
  window.location.replace(target);
})();
