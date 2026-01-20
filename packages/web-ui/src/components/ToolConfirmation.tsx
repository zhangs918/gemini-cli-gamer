/* eslint-disable */
import type { ToolCall } from '../types';
import './ToolConfirmation.css';

interface ToolConfirmationProps {
  toolCall: ToolCall;
  onConfirm: (confirmed: boolean) => void;
}

const ToolConfirmation: React.FC<ToolConfirmationProps> = ({
  toolCall,
  onConfirm,
}) => {
  return (
    <div className="tool-confirmation-overlay">
      <div className="tool-confirmation-dialog">
        <h3>工具调用确认</h3>
        <div className="tool-confirmation-content">
          <p>
            <strong>工具名称:</strong> {toolCall.name}
          </p>
          <p>
            <strong>参数:</strong>
          </p>
          <pre className="tool-confirmation-args">
            {JSON.stringify(toolCall.args, null, 2)}
          </pre>
        </div>
        <div className="tool-confirmation-actions">
          <button
            className="tool-confirm-button tool-confirm-allow"
            onClick={() => onConfirm(true)}
          >
            允许
          </button>
          <button
            className="tool-confirm-button tool-confirm-deny"
            onClick={() => onConfirm(false)}
          >
            拒绝
          </button>
        </div>
      </div>
    </div>
  );
};

export default ToolConfirmation;
