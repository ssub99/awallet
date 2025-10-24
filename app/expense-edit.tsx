/**
 * Expense Edit Screen
 * 
 * Screen for editing existing expense records.
 * Uses the shared ExpenseRecordScreen component in edit mode.
 */

import { useLocalSearchParams } from 'expo-router';
import ExpenseRecordScreen from './expense-record';

export default function ExpenseEditScreen() {
  const { recordData } = useLocalSearchParams<{
    recordData?: string;
  }>();

  // Parse the record data
  const editData = recordData ? JSON.parse(recordData) : null;

  return <ExpenseRecordScreen mode="edit" editData={editData} />;
}