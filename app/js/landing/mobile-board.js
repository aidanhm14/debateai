
/* Move the example board to the top of the mobile home (2026-09-02).
 *
 * A MOVE, never a copy: the board's rotator resolves every node by id
 * (fsMotion, fsClock, fsFaceA and about forty more), so a second copy
 * in the DOM would leave getElementById pointing at whichever came
 * first and the visible card would never update.
 *
 * It runs once, only under 720px, and it is one-way on purpose. A phone
 * that is rotated or a window that is dragged wider mid-session keeps
 * the board where it is rather than teleporting it out from under a
 * finger; the next load puts it back in the desktop composition.
 */
(function(){
  if (!window.matchMedia || !window.matchMedia('(max-width:720px)').matches) return;
  function move(){
    var slot = document.getElementById('mhBoardSlot');
    var board = document.getElementById('fsBoard');
    if (!slot || !board || slot.contains(board)) return;
    slot.appendChild(board);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', move);
  else move();
})();
