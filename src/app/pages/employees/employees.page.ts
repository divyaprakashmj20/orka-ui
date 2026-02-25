import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar
} from '@ionic/angular/standalone';
import {
  ACCESS_ROLES,
  AccessRole,
  EMPLOYEE_ROLES,
  Employee,
  EmployeeRole,
  Hotel
} from '../../core/models/orca.models';
import { OrcaApiService } from '../../core/services/orca-api.service';

type EmployeeForm = {
  id: number | null;
  name: string;
  role: EmployeeRole | null;
  accessRole: AccessRole | null;
  phone: string;
  active: boolean;
  hotelId: number | null;
};

@Component({
  selector: 'app-employees-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonList,
    IonItem,
    IonLabel
  ],
  templateUrl: './employees.page.html',
  styleUrl: './employees.page.scss'
})
export class EmployeesPage implements OnInit {
  protected readonly items = signal<Employee[]>([]);
  protected readonly hotels = signal<Hotel[]>([]);
  protected readonly employeeRoles = EMPLOYEE_ROLES;
  protected readonly accessRoles = ACCESS_ROLES;
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected form: EmployeeForm = this.emptyForm();

  constructor(private readonly api: OrcaApiService) {}

  ngOnInit(): void {
    this.refreshAll();
  }

  protected refreshAll(): void {
    this.loadEmployees();
    this.api.listHotels().subscribe({
      next: (hotels) => this.hotels.set(hotels),
      error: () => this.error.set('Failed to load hotel lookup.')
    });
  }

  protected loadEmployees(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listEmployees().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load employees.');
        this.loading.set(false);
      }
    });
  }

  protected save(): void {
    const name = this.form.name.trim();
    if (!name || !this.form.role || !this.form.accessRole || this.form.hotelId == null) {
      this.error.set('Name, role, access role, and hotel are required.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const payload: Employee = {
      id: this.form.id ?? undefined,
      name,
      role: this.form.role,
      accessRole: this.form.accessRole,
      phone: this.form.phone.trim() || null,
      active: this.form.active,
      hotel: { id: this.form.hotelId }
    };

    this.api.saveEmployee(payload).subscribe({
      next: () => {
        this.form = this.emptyForm();
        this.saving.set(false);
        this.loadEmployees();
      },
      error: () => {
        this.error.set('Save failed.');
        this.saving.set(false);
      }
    });
  }

  protected edit(item: Employee): void {
    this.form = {
      id: item.id ?? null,
      name: item.name ?? '',
      role: item.role ?? null,
      accessRole: item.accessRole ?? 'STAFF',
      phone: item.phone ?? '',
      active: item.active ?? true,
      hotelId: item.hotel?.id ?? null
    };
  }

  protected remove(item: Employee): void {
    if (item.id == null) {
      return;
    }
    if (!window.confirm(`Delete employee "${item.name}"?`)) {
      return;
    }
    this.api.deleteEmployee(item.id).subscribe({
      next: () => this.loadEmployees(),
      error: () => this.error.set('Delete failed. Employee may be referenced by requests.')
    });
  }

  protected resetForm(): void {
    this.form = this.emptyForm();
  }

  private emptyForm(): EmployeeForm {
    return {
      id: null,
      name: '',
      role: null,
      accessRole: 'STAFF',
      phone: '',
      active: true,
      hotelId: null
    };
  }
}
