import { AppRouter } from './router';
export function App() {
  return <AppRouter routes={[{path:'/',element:<main><h1>Academia virtual</h1><p>En preparación.</p></main>}]} />;
}
