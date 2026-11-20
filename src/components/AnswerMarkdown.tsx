import React, {memo} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const AnswerMarkdown = memo(function AnswerMarkdown({text}: {text: string}) {
  return <div className="answer-markdown">
    <Markdown skipHtml remarkPlugins={[remarkGfm]} components={{
      // Keep destinations readable without navigating the app or fetching images.
      a: ({children, href}) => <span title={href || undefined}>{children}</span>,
      img: ({alt}) => alt ? <span>{alt}</span> : null,
      table: ({children}) => <div className="markdown-table"><table>{children}</table></div>,
    }}>{text}</Markdown>
  </div>;
});
