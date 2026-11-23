import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import Recommendations from './Recommendations';

vi.mock('../Sessions/recommendationDecisions',()=>({applyRecommendationDecision:vi.fn()}));
const interaction={
  version:'reflect.interaction.v1',stage:'synthesize',clarifyingQuestion:'',
  insights:[],unknowns:[],recommendationCandidates:[{
    title:'Проверить MVP',rationale:'Из исходного текста',sourceRefs:['current-message']
  }]
};
const sessions=[{
  id:'source-id',title:'Источник',
  chatHistory:[{id:'user-one',role:'user',content:'Хочу проверить MVP'},
    {id:'assistant-one',role:'assistant',interaction}],
  recommendationDecisions:{'r-assistant-one-0':{
    status:'saved',archivedAt:{seconds:2}
  }}
}];

test('R9.2.4B archives preserve status and exact source provenance',async()=>{
  const onSetArchived=vi.fn().mockResolvedValue({archived:false,changed:true});
  render(<Recommendations sessions={sessions} userId="owner"
    onSetArchived={onSetArchived}/>);
  expect(screen.queryByText('Проверить MVP')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Архив рекомендаций/}));
  expect(screen.getByText('Проверить MVP')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Восстановить: рекомендация/}));
  await waitFor(()=>expect(onSetArchived).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({sessionId:'source-id',assistantMessageId:'assistant-one',index:0}),false
  ));
});
