(() => {
  async function boot() {
    // Guard: only run on youtube.com.
    if (location.hostname !== "www.youtube.com") return;

    const sm = new window.PN_Session.SessionManager();
    await sm.init();

    const friction = new window.PN_Friction.FrictionController();
    await friction.init();

    const notes = new window.PN_Notes.NotesController();
    await notes.init();
  }

  // document_start can run before DOM is ready; our UI roots attach to documentElement.
  boot().catch(() => {});
})();

