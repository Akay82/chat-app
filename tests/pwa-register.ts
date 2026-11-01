// Unit tests have no real service worker. Browser/build checks cover registration.
export const useRegisterSW = () => ({
  needRefresh: [false],
  updateServiceWorker: async () => {},
});
