import { Route, Switch } from 'wouter';
import Dashboard from './pages/Dashboard';
import VoiceAgent from './pages/VoiceAgent';

function App() {
  return (
    <div className="app">
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/voice" component={VoiceAgent} />
        <Route>404 - Not Found</Route>
      </Switch>
    </div>
  );
}

export default App;