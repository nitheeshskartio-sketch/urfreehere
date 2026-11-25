import { Compass } from 'lucide-react';
import { Link } from '../site/Link';
import { buttonClasses } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { StateMessage } from '../ui/StateMessage';

export default function NotFound() {
  return (
    <div className="page max-w-[720px] py-16">
      <Panel>
        <StateMessage icon={Compass} tone="neutral" title="Page not found" message="The page you're looking for doesn't exist or has moved.">
          <Link href="/" className={buttonClasses('primary')}>
            Go to the home page
          </Link>
        </StateMessage>
      </Panel>
    </div>
  );
}
