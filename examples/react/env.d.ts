// The theme ships plain stylesheets; the bundler (Vite) handles the side-effect import. tsc only
// needs to know the module exists.
declare module '@gallerist/theme-default/*.css'
